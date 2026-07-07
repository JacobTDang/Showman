package orchestrator

import (
	"context"
	"encoding/json"
	"testing"
)

// stubEngine serves a fixed catalog (mirroring the real tools' names/keywords) without HTTP.
type stubEngine struct{ tools []CatalogEntry }

func (s *stubEngine) Catalog(_ context.Context, domain Domain) ([]CatalogEntry, error) {
	if domain == "" {
		return s.tools, nil
	}
	var out []CatalogEntry
	for _, t := range s.tools {
		if t.Domain == domain {
			out = append(out, t)
		}
	}
	return out, nil
}
func (s *stubEngine) CatalogDigest(context.Context, Domain) (string, error) { return "digest", nil }
func (s *stubEngine) Build(context.Context, BuildRequest) (BuildResult, error) {
	return BuildResult{}, nil
}
func (s *stubEngine) Assemble(context.Context, AssembleRequest) (AssembleResult, error) {
	return AssembleResult{OK: true, Spec: json.RawMessage(`{}`), SpecHash: "h"}, nil
}
func (s *stubEngine) Render(context.Context, RenderRequest) (RenderResult, error) {
	return RenderResult{}, nil
}

func realishCatalog() []CatalogEntry {
	return []CatalogEntry{
		{Name: "math.numberLine", Domain: DomainMath, Level: "node", Keywords: []string{"number line", "interval"}},
		{Name: "math.fractionLesson", Domain: DomainMath, Level: "scene", Keywords: []string{"fraction", "pie", "numerator", "denominator"}},
		{Name: "math.graphingLesson", Domain: DomainMath, Level: "scene", Keywords: []string{"graph", "line", "slope", "y = mx + b", "coordinate plane", "plot"}},
		{Name: "math.quadraticLesson", Domain: DomainMath, Level: "scene", Keywords: []string{"quadratic", "parabola", "vertex"}},
		{Name: "math.countingLesson", Domain: DomainMath, Level: "scene", Keywords: []string{"count", "counting", "how many"}},
		// chem.reaction is genuinely offline-excluded (see offlineExcluded's doc comment:
		// reactants/products need a real balanced equation, not a generic default) — kept
		// here to prove the exclusion holds even when it's the ONLY keyword match in its
		// domain (TestKeywordSelectorExcludesUnfillableToolsEvenAsOnlyDomainMatch).
		{Name: "chem.reaction", Domain: DomainChem, Level: "node", Keywords: []string{"reaction", "chemical equation", "combustion"}},
		{Name: "chem.molecule", Domain: DomainChem, Level: "node", Keywords: []string{"molecule", "structure", "compound", "smiles", "atoms", "bonds", "chemical structure"}},
		{Name: "items.card", Domain: DomainItems, Level: "node", Keywords: []string{"card", "summary", "takeaway"}},
	}
}

func sel() *KeywordSelector { return NewKeywordSelector(&stubEngine{tools: realishCatalog()}) }

// expandedCatalog mirrors the REAL keyword sets (copied verbatim from the TS tool
// files) for a representative slice of every domain the catalog grew into across
// Roadmap A1-A4 (~90 tools total by A4; this is the subset most likely to collide on
// shared words like "graph"/"table"/"energy"/"line"). Roadmap A5: the offline
// selector must still discriminate correctly at this scale, not just against the
// original 7-tool fixture.
func expandedCatalog() []CatalogEntry {
	return []CatalogEntry{
		{Name: "math.functionGraph", Domain: DomainMath, Level: "node", Keywords: []string{
			"graph", "plot", "coordinate plane", "y = mx + b", "line", "slope", "parabola", "quadratic", "y = ax^2", "function", "curve", "points", "scatter",
		}},
		{Name: "math.numberLine", Domain: DomainMath, Level: "node", Keywords: []string{"number line", "interval"}},
		{Name: "math.balanceScale", Domain: DomainMath, Level: "node", Keywords: []string{
			"balance", "scale", "equation", "solve", "unknown", "variable", "equal", "compare", "weigh",
		}},
		{Name: "physics.rayDiagram", Domain: DomainPhysics, Level: "node", Keywords: []string{
			"lens", "ray diagram", "optics", "focal length", "image formation", "converging", "diverging", "refraction",
		}},
		{Name: "physics.energyBars", Domain: DomainPhysics, Level: "node", Keywords: []string{
			"energy", "kinetic", "potential", "conservation", "bar chart", "KE", "PE", "thermal",
		}},
		{Name: "physics.circuit", Domain: DomainPhysics, Level: "node", Keywords: []string{
			"circuit", "series circuit", "resistor", "battery", "switch", "capacitor", "diode", "wire", "electricity", "voltage", "current",
		}},
		{Name: "physics.motionGraph", Domain: DomainPhysics, Level: "node", Keywords: []string{
			"motion graph", "position vs time", "velocity vs time", "acceleration vs time", "position time graph", "velocity time graph", "kinematics", "moving man", "x-t graph", "v-t graph",
		}},
		{Name: "physics.vectorField", Domain: DomainPhysics, Level: "node", Keywords: []string{
			"vector field", "field lines", "electric field", "magnetic field", "gravitational field", "flow field", "field arrows", "vortex", "dipole field",
		}},
		{Name: "chem.energyDiagram", Domain: DomainChem, Level: "node", Keywords: []string{
			"energy diagram", "activation energy", "reaction coordinate", "transition state", "catalyst", "exothermic", "endothermic",
		}},
		{Name: "chem.periodicTable", Domain: DomainChem, Level: "node", Keywords: []string{
			"periodic table", "element", "atomic number", "group", "period", "metals", "nonmetals",
		}},
		{Name: "chem.molecule", Domain: DomainChem, Level: "node", Keywords: []string{
			"molecule", "structure", "compound", "smiles", "atoms", "bonds", "chemical structure",
		}},
		{Name: "diagram.table", Domain: DomainDiagram, Level: "node", Keywords: []string{
			"table", "grid", "rows", "columns", "data table", "spreadsheet",
		}},
		{Name: "diagram.flowchart", Domain: DomainDiagram, Level: "node", Keywords: []string{
			"flowchart", "flow chart", "process diagram", "steps", "boxes and arrows", "workflow",
		}},
		{Name: "chart.bar", Domain: DomainChart, Level: "node", Keywords: []string{
			"bar chart", "bars", "categories", "compare", "stacked bar", "data",
		}},
		{Name: "chart.line", Domain: DomainChart, Level: "node", Keywords: []string{
			"line chart", "trend", "time series", "plot", "series", "data over time",
		}},
		{Name: "chart.scatter", Domain: DomainChart, Level: "node", Keywords: []string{
			"scatter plot", "scatter chart", "correlation", "points", "distribution", "clusters",
		}},
		{Name: "items.card", Domain: DomainItems, Level: "node", Keywords: []string{"card", "summary", "takeaway"}},
	}
}

func expandedSel() *KeywordSelector { return NewKeywordSelector(&stubEngine{tools: expandedCatalog()}) }

// TestKeywordSelectorScalesAcrossExpandedCatalog proves keyword scoring (sum of
// matched-keyword lengths, longest/most-specific phrase wins) still discriminates
// correctly once the catalog holds many domains with overlapping vocabulary — e.g.
// "periodic table" (chem.periodicTable, 14 chars) must beat "table" (diagram.table,
// 5 chars) even though both match text containing "periodic table".
func TestKeywordSelectorScalesAcrossExpandedCatalog(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		goal string
		want string
	}{
		{"show the periodic table of elements and highlight sodium", "chem.periodicTable"},
		{"plot the line y = 2x + 1 on a coordinate plane", "math.functionGraph"},
		{"draw a ray diagram for a converging lens with focal length 10", "physics.rayDiagram"},
		{"show the reaction energy diagram with the activation energy peak", "chem.energyDiagram"},
		// chart.bar/line/scatter and physics.energyBars are offlineExcluded (real chart/
		// accounting data no default can synthesize) — these beats fall through to
		// whatever else scores (math.functionGraph shares "plot"/"scatter" vocabulary) or
		// the global math.countingLesson fallback. See TestKeywordSelectorExcludes* below
		// for the exclusion itself; this just proves it doesn't break discrimination among
		// everything that's still eligible.
		{"chart the quarterly revenue as a bar chart across categories", "math.countingLesson"},
		{"plot temperature as a line chart trend over time", "math.functionGraph"},
		{"draw a scatter plot showing the correlation between two variables", "math.functionGraph"},
		{"draw a flowchart of the steps in the process", "diagram.flowchart"},
		{"put the results in a data table with rows and columns", "diagram.table"},
		{"draw the molecule structure for water using smiles", "chem.molecule"},
		{"wire a series circuit with a battery and a resistor", "physics.circuit"},
		{"show the energy bars for kinetic and potential energy conservation", "math.countingLesson"},
		{"show the position vs time and velocity vs time motion graph for kinematics", "physics.motionGraph"},
		{"draw the electric field lines around a point charge as a vector field", "physics.vectorField"},
	}
	for _, c := range cases {
		got, err := expandedSel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: c.goal}})
		if err != nil {
			t.Fatalf("%q: %v", c.goal, err)
		}
		if got[0].Builder != c.want {
			t.Errorf("%q: want %s, got %s", c.goal, c.want, got[0].Builder)
		}
	}
}

// TestKeywordSelectorExtractsCircuitElements proves extractCircuitElements finds known
// element vocabulary in text order and falls back to a generic, always-valid loop when
// the beat mentions "circuit" generically but names nothing specific.
func TestKeywordSelectorExtractsCircuitElements(t *testing.T) {
	ctx := context.Background()

	got, err := expandedSel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "wire a series circuit with a battery, a resistor, and a switch"}})
	if err != nil {
		t.Fatal(err)
	}
	if got[0].Builder != "physics.circuit" {
		t.Fatalf("want physics.circuit, got %s", got[0].Builder)
	}
	elements, ok := got[0].Params["elements"].([]map[string]any)
	if !ok || len(elements) != 3 {
		t.Fatalf("expected 3 elements in text order, got %+v", got[0].Params["elements"])
	}
	wantKinds := []string{"battery", "resistor", "switch"}
	for i, want := range wantKinds {
		if elements[i]["kind"] != want {
			t.Errorf("element %d: want %s, got %+v", i, want, elements[i])
		}
	}

	generic, _ := expandedSel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "wire a circuit"}})
	genElements, ok := generic[0].Params["elements"].([]map[string]any)
	if !ok || len(genElements) != 2 {
		t.Fatalf("expected a generic 2-element fallback loop, got %+v", generic[0].Params["elements"])
	}
}

// TestKeywordSelectorExtractsMoleculeName proves extractMoleculeName matches a known
// library name in beat text (including the methane/ethane substring-containment case)
// and falls back to "water" when nothing in the library is named.
func TestKeywordSelectorExtractsMoleculeName(t *testing.T) {
	ctx := context.Background()

	got, _ := expandedSel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "draw the molecule structure for benzene"}})
	if got[0].Builder != "chem.molecule" || got[0].Params["name"] != "benzene" {
		t.Fatalf("want chem.molecule/benzene, got %+v", got[0])
	}

	// "methane" contains "ethane" as a substring (m-ETHANE) — must not misfire on it.
	methane, _ := expandedSel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "show the molecule structure of methane"}})
	if methane[0].Params["name"] != "methane" {
		t.Fatalf("methane/ethane substring collision: got %+v", methane[0].Params)
	}

	fallback, _ := expandedSel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "draw a molecule structure"}})
	if fallback[0].Params["name"] != "water" {
		t.Fatalf("expected water fallback, got %+v", fallback[0].Params)
	}
}

func TestKeywordSelectorPicksByKeywordsAndExtractsParams(t *testing.T) {
	ctx := context.Background()

	got, err := sel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "graph the line y = 2x + 1 on a coordinate plane"}})
	if err != nil {
		t.Fatal(err)
	}
	if got[0].Builder != "math.graphingLesson" {
		t.Fatalf("want graphingLesson, got %s", got[0].Builder)
	}
	if got[0].Params["m"] != 2.0 || got[0].Params["b"] != 1.0 {
		t.Fatalf("slope/intercept not extracted: %+v", got[0].Params)
	}

	frac, _ := sel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "show the fraction 3/4 as a pie"}})
	if frac[0].Builder != "math.fractionLesson" || frac[0].Params["numerator"] != 3 || frac[0].Params["denominator"] != 4 {
		t.Fatalf("fraction extraction failed: %+v", frac[0])
	}

	count, _ := sel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "teach counting to 7 with stars"}})
	if count[0].Builder != "math.countingLesson" || count[0].Params["count"] != 7 {
		t.Fatalf("count extraction failed: %+v", count[0])
	}
}

func TestKeywordSelectorHonorsDomainHintAndWidens(t *testing.T) {
	ctx := context.Background()

	chem, _ := sel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "draw the water molecule structure", DomainHint: DomainChem}})
	if chem[0].Builder != "chem.molecule" {
		t.Fatalf("domain hint not honored: %+v", chem[0])
	}

	// A chem-hinted beat whose text only matches a math tool: widen beyond the hint.
	widened, _ := sel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "plot a parabola", DomainHint: DomainChem}})
	if widened[0].Builder != "math.quadraticLesson" {
		t.Fatalf("expected widening to find quadraticLesson, got %+v", widened[0])
	}
}

// TestKeywordSelectorExcludesUnfillableToolsEvenAsOnlyDomainMatch proves offlineExcluded
// is checked BEFORE domain-widening kicks in: a chem-hinted beat that textually matches
// ONLY chem.reaction (excluded — needs a real reactants/products list no default can
// synthesize) must not select it just because nothing else in-domain scored. It should
// behave exactly as if chem.reaction didn't exist: widen, find nothing elsewhere either,
// and land on the global counting-lesson fallback.
func TestKeywordSelectorExcludesUnfillableToolsEvenAsOnlyDomainMatch(t *testing.T) {
	got, err := sel().Select(context.Background(), SelectorView{Beat: SceneBeat{Goal: "show the combustion reaction", DomainHint: DomainChem}})
	if err != nil {
		t.Fatal(err)
	}
	if got[0].Builder != "math.countingLesson" {
		t.Fatalf("expected offlineExcluded chem.reaction to be skipped entirely, got %+v", got[0])
	}
}

func TestKeywordSelectorFallsBackToCounting(t *testing.T) {
	got, err := sel().Select(context.Background(), SelectorView{Beat: SceneBeat{Goal: "zzz nothing matches this"}})
	if err != nil {
		t.Fatal(err)
	}
	if got[0].Builder != "math.countingLesson" {
		t.Fatalf("expected counting fallback, got %+v", got[0])
	}
}
