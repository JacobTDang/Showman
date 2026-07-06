package orchestrator

import (
	"context"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// DomainSelector picks builders (+ params) for one scene beat. The LLM selector arrives
// with the Eino graph; KeywordSelector is the offline tier that keeps the whole pipeline
// runnable with zero API key, and the fallback rung when the LLM is exhausted.
type DomainSelector interface {
	Select(ctx context.Context, view SelectorView) ([]BuilderPlacement, error)
}

// KeywordSelector scores the beat's text against each catalog tool's keywords and emits
// a single best BuilderPlacement. It consumes the same catalog the LLM selector sees
// (fetched from the engine), so both paths funnel through identical validation.
type KeywordSelector struct {
	engine EngineClient
}

// NewKeywordSelector builds the offline selector over an engine client.
func NewKeywordSelector(engine EngineClient) *KeywordSelector {
	return &KeywordSelector{engine: engine}
}

// Select picks the best-matching tool for the beat and fills mechanically-extractable
// params (count, fraction, slope/intercept, quadratic coefficients). Falls back to the
// counting lesson when nothing matches — every beat yields a renderable placement.
func (s *KeywordSelector) Select(ctx context.Context, view SelectorView) ([]BuilderPlacement, error) {
	domain := view.Beat.DomainHint // empty = all domains
	tools, err := s.engine.Catalog(ctx, domain)
	if err != nil {
		return nil, err
	}

	text := beatText(view.Beat)
	best, score := pickTool(tools, text)
	if best == nil || score == 0 {
		// No keyword hit inside the hinted domain — widen once, then fall back.
		if domain != "" {
			if all, err := s.engine.Catalog(ctx, ""); err == nil {
				best, score = pickTool(all, text)
			}
		}
		if best == nil || score == 0 {
			return []BuilderPlacement{{Builder: "math.countingLesson", Params: map[string]any{}}}, nil
		}
	}

	return []BuilderPlacement{{Builder: best.Name, Params: paramsFor(best.Name, view.Beat, text)}}, nil
}

// paramsFor fills mechanically-derivable params. items.card takes its content from the
// beat itself (its Zod schema requires a title); everything else goes through the text
// extractors.
func paramsFor(builder string, beat SceneBeat, text string) map[string]any {
	if builder == "items.card" {
		title := strings.TrimSpace(beat.Title)
		if title == "" {
			title = strings.TrimSpace(beat.Goal)
		}
		lines := beat.KeyPoints
		if len(lines) > 3 {
			lines = lines[:3]
		}
		return map[string]any{"title": title, "lines": lines}
	}
	return extractParams(builder, text)
}

// beatText is the text surface the selector matches against.
func beatText(b SceneBeat) string {
	parts := append([]string{b.Title, b.Goal}, b.KeyPoints...)
	parts = append(parts, b.NarrationBeats...)
	return strings.ToLower(strings.Join(parts, " "))
}

// offlineExcluded lists tools whose required params represent real, specific content
// (chart data series, an actual free-body force list, a specific chemical reaction, a
// literal math expression to typeset...) that no generic default or beat-text regex can
// honestly synthesize. Selecting one of these offline would just trade a keyword miss
// for a guaranteed Zod validation failure at build time. These need the LLM tier, which
// can actually invent plausible content; the offline tier skips them entirely and falls
// through to the next-best candidate (or the global math.countingLesson fallback).
var offlineExcluded = map[string]bool{
	"chart.bar":            true,
	"chart.line":           true,
	"chart.area":           true,
	"chart.scatter":        true,
	"math.barGraph":        true,
	"math.pictograph":      true,
	"math.mathExpr":        true,
	"physics.energyBars":   true,
	"physics.forceDiagram": true,
	"chem.reaction":        true,
	"chem.lewisStructure":  true,
}

// pickTool returns the tool with the highest keyword score. Longer keyword phrases weigh
// more (they are more specific); name order breaks ties deterministically. Sorts a COPY:
// concurrent scenes may share one catalog slice (a caching client would return the same
// backing array to every goroutine), so mutating the input is a data race. Tools in
// offlineExcluded are skipped entirely, never scored — see its doc comment.
func pickTool(tools []CatalogEntry, text string) (*CatalogEntry, int) {
	tools = append([]CatalogEntry(nil), tools...)
	sort.Slice(tools, func(i, j int) bool { return tools[i].Name < tools[j].Name })
	var best *CatalogEntry
	bestScore := 0
	for i := range tools {
		if offlineExcluded[tools[i].Name] {
			continue
		}
		score := 0
		for _, kw := range tools[i].Keywords {
			k := strings.ToLower(strings.TrimSpace(kw))
			if k != "" && strings.Contains(text, k) {
				score += len(k)
			}
		}
		if score > bestScore {
			best = &tools[i]
			bestScore = score
		}
	}
	return best, bestScore
}

var (
	fractionRe  = regexp.MustCompile(`(\d+)\s*/\s*(\d+)`)
	slopeRe     = regexp.MustCompile(`y\s*=\s*(-?\d+(?:\.\d+)?)\s*\*?\s*x\s*([+-]\s*\d+(?:\.\d+)?)?`)
	quadraticRe = regexp.MustCompile(`y\s*=\s*(-?\d+(?:\.\d+)?)\s*\*?\s*x\s*\^?\s*2\s*([+-]\s*\d+(?:\.\d+)?\s*\*?\s*x)?\s*([+-]\s*\d+(?:\.\d+)?)?`)
	intRe       = regexp.MustCompile(`\b(\d+)\b`)
)

// extractParams mechanically pulls the obviously-parseable params out of the beat text.
// This replaces the old regex *dispatch*; the regexes survive only as param extractors,
// exactly as the design prescribed.
func extractParams(builder, text string) map[string]any {
	params := map[string]any{}
	switch builder {
	case "math.fractionLesson":
		if m := fractionRe.FindStringSubmatch(text); m != nil {
			if n, err := strconv.Atoi(m[1]); err == nil {
				params["numerator"] = n
			}
			if d, err := strconv.Atoi(m[2]); err == nil && d > 0 {
				params["denominator"] = d
			}
		}
	// The A1 math wave added node-level fraction tools (fractionCircle/fractionBar/
	// numberLineFraction) with keywords overlapping fractionLesson's ("fraction",
	// "pie") — the offline selector can legitimately pick any of them for a beat
	// whose text carries no actual fraction (a generic intro/recap beat matched on
	// "fraction" alone). Unlike fractionLesson, these three REQUIRE the pair with
	// no schema default, so a miss here is a guaranteed validation failure, not a
	// cosmetic gap — fall back to a generic 1/2 so the offline tier never picks a
	// tool it then can't build.
	case "math.fractionCircle", "math.fractionBar", "math.numberLineFraction":
		params["numerator"] = 1
		params["denominator"] = 2
		if m := fractionRe.FindStringSubmatch(text); m != nil {
			if n, err := strconv.Atoi(m[1]); err == nil {
				params["numerator"] = n
			}
			if d, err := strconv.Atoi(m[2]); err == nil && d > 0 {
				params["denominator"] = d
			}
		}
	case "math.quadraticLesson":
		if m := quadraticRe.FindStringSubmatch(text); m != nil {
			if a, err := strconv.ParseFloat(m[1], 64); err == nil {
				params["a"] = a
			}
			if m[2] != "" {
				if b, err := strconv.ParseFloat(stripCoeff(m[2], "x"), 64); err == nil {
					params["b"] = b
				}
			}
			if m[3] != "" {
				if c, err := strconv.ParseFloat(compactSign(m[3]), 64); err == nil {
					params["c"] = c
				}
			}
		}
	case "math.graphingLesson":
		if m := slopeRe.FindStringSubmatch(text); m != nil {
			if slope, err := strconv.ParseFloat(m[1], 64); err == nil {
				params["m"] = slope
			}
			if m[2] != "" {
				if b, err := strconv.ParseFloat(compactSign(m[2]), 64); err == nil {
					params["b"] = b
				}
			}
		}
	case "math.countingLesson", "math.additionLesson", "math.subtractionLesson", "math.multiplicationLesson":
		if m := intRe.FindStringSubmatch(text); m != nil {
			if n, err := strconv.Atoi(m[1]); err == nil && n >= 1 && n <= 10 {
				params["count"] = n
			}
		}
	case "physics.circuit":
		params["elements"] = extractCircuitElements(text)
	case "chem.molecule":
		params["name"] = extractMoleculeName(text)
	}
	return params
}

// circuitKindPhrases maps each circuit.tool.ts element kind to the phrase(s) that signal
// it in beat text. "meter" checks its more specific synonyms first so e.g. "voltmeter"
// isn't missed by a caller who never wrote the bare word "meter".
var circuitKindPhrases = []struct {
	kind    string
	phrases []string
}{
	{"battery", []string{"battery"}},
	{"resistor", []string{"resistor"}},
	{"capacitor", []string{"capacitor"}},
	{"lamp", []string{"lamp", "bulb"}},
	{"switch", []string{"switch"}},
	{"inductor", []string{"inductor", "coil"}},
	{"acSource", []string{"ac source", "alternator"}},
	{"diode", []string{"diode"}},
	{"meter", []string{"voltmeter", "ammeter", "meter"}},
}

// extractCircuitElements scans beat text for known circuit-element vocabulary and
// returns them in the order they appear (matching how circuit.tool.ts wires elements
// left-to-right into a series loop). Falls back to a generic, always-valid two-element
// loop when the beat mentions "circuit"/"wire" generically but names nothing specific —
// physics.circuit's `elements` param has no schema default and requires min 1, so a miss
// here would otherwise be a guaranteed build-time validation failure.
func extractCircuitElements(text string) []map[string]any {
	type match struct {
		pos  int
		kind string
	}
	var found []match
	for _, k := range circuitKindPhrases {
		best := -1
		for _, phrase := range k.phrases {
			if idx := strings.Index(text, phrase); idx >= 0 && (best == -1 || idx < best) {
				best = idx
			}
		}
		if best >= 0 {
			found = append(found, match{pos: best, kind: k.kind})
		}
	}
	if len(found) == 0 {
		return []map[string]any{{"kind": "battery"}, {"kind": "resistor"}}
	}
	sort.Slice(found, func(i, j int) bool { return found[i].pos < found[j].pos })
	if len(found) > 6 { // circuit.tool.ts's elements array caps at 6
		found = found[:6]
	}
	elements := make([]map[string]any, len(found))
	for i, m := range found {
		elements[i] = map[string]any{"kind": m.kind}
	}
	return elements
}

// moleculeNames mirrors MOLECULE_LIBRARY's keys in moleculeLibrary.ts verbatim. Sorted
// longest-first so a genuine "methane" match is tried before "ethane" — "methane" itself
// contains "ethane" as a substring (m-ETHANE), so shortest-first would misfire on it.
var moleculeNames = []string{
	"hydrogen", "nitrogen", "methanol", // 8
	"methane", "ammonia", "ethanol", "benzene", // 7
	"ethyne", "ethane", "ethene", "oxygen", // 6
	"ozone", "water", // 5
}

// extractMoleculeName scans beat text for a known library molecule name. chem.molecule's
// `name` is a Zod enum with no default (a `smiles` alternative exists but isn't
// mechanically derivable from prose), so a miss here would be a guaranteed validation
// failure; "water" is a safe, always-valid fallback.
func extractMoleculeName(text string) string {
	for _, name := range moleculeNames {
		if strings.Contains(text, name) {
			return name
		}
	}
	return "water"
}

// compactSign turns "+ 3" / "- 3" into "+3" / "-3" so ParseFloat accepts it.
func compactSign(s string) string {
	return strings.ReplaceAll(strings.TrimSpace(s), " ", "")
}

// stripCoeff removes a trailing variable (and any '*') from a coefficient term like "+ 2x".
func stripCoeff(s, variable string) string {
	s = strings.ReplaceAll(s, "*", "")
	s = strings.TrimSuffix(strings.TrimSpace(s), variable)
	return compactSign(s)
}
