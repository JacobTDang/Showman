package orchestrator

import "strings"

// Context views: small, strongly-typed projections of the JobContext. Every LLM node
// receives a view, NEVER the whole store — this is what keeps the model's context tight
// and the prompts cheap. A view never carries a field its node doesn't use; widening a
// view is a deliberate, reviewable change.

const defaultBudgetSec = 90

// PlannerView is what the Lesson Planner sees: the request + budget + available domains.
// No scenes exist yet.
type PlannerView struct {
	Request       ExternalRequest `json:"request"`
	DefaultBudget int             `json:"defaultBudgetSec"`
	Domains       []Domain        `json:"catalogDomains"`
}

// SelectorView is what the Domain Selector sees for one beat: the beat, the (compact,
// domain-filtered) catalog digest, the last few recap lines, and the theme.
type SelectorView struct {
	Beat          SceneBeat    `json:"beat"`
	CatalogDigest string       `json:"catalogDigest"`
	RecapTail     []RecapEntry `json:"recapTail"`
	Theme         string       `json:"theme"`
}

// AssemblerInput is the deterministic Scene Assembler's input (no LLM). It is shipped to
// the engine's POST /assemble.
type AssemblerInput struct {
	Placements []BuilderPlacement `json:"placements"`
	Beat       SceneBeat          `json:"beat"`
	Theme      string             `json:"theme"`
	Palette    Palette            `json:"palette"`
	Canvas     Canvas             `json:"canvas"`
	PrevRecap  *RecapEntry        `json:"prevRecap,omitempty"`
	Seed       int64              `json:"seed"`
}

// PlanView projects the store for the Lesson Planner.
func PlanView(s *JobContext) PlannerView {
	budget := defaultBudgetSec
	if s.Request.Options.TargetDurationSec > 0 {
		budget = s.Request.Options.TargetDurationSec
	}
	return PlannerView{Request: s.Request, DefaultBudget: budget, Domains: AllDomains()}
}

// SelectView projects the store for the Domain Selector at scene index. The caller supplies
// the (engine-fetched) catalog digest so the projection stays pure.
func SelectView(s *JobContext, index int, catalogDigest string) SelectorView {
	return SelectorView{
		Beat:          s.Scenes[index].Beat,
		CatalogDigest: catalogDigest,
		RecapTail:     recapTail(s.Continuity.Recap, 2),
		Theme:         s.Continuity.Theme,
	}
}

// AsmInput projects the store for the deterministic Scene Assembler at scene index.
// It composes the scene's full narration line-up (P2): the plan's intro on scene 0 /
// the arc's per-beat transition as a lead-in, the beat's own lines, and the outro on
// the last scene — so the assembler can time animation beats to what is spoken.
func AsmInput(s *JobContext, index int) AssemblerInput {
	sc := s.Scenes[index]
	var prev *RecapEntry
	if n := len(s.Continuity.Recap); n > 0 {
		p := s.Continuity.Recap[n-1]
		prev = &p
	}
	beat := sc.Beat
	beat.NarrationBeats = narrationLineup(s, beat, index)
	return AssemblerInput{
		Placements: sc.Placements,
		Beat:       beat,
		Theme:      s.Continuity.Theme,
		Palette:    s.Continuity.Palette,
		Canvas:     s.Continuity.Canvas,
		PrevRecap:  prev,
		Seed:       SceneSeed(s.RootSeed, index),
	}
}

// narrationLineup assembles the ordered spoken lines for one scene from the plan's
// narration arc + the beat's own lines. Pure; duplicates are avoided when the planner
// already used the same line.
func narrationLineup(s *JobContext, beat SceneBeat, index int) []string {
	lines := make([]string, 0, len(beat.NarrationBeats)+2)
	if s.Plan != nil {
		arc := s.Plan.NarrationArc
		if lead := pickLead(arc, beat, index); lead != "" && !contains(beat.NarrationBeats, lead) {
			lines = append(lines, lead)
		}
	}
	lines = append(lines, beat.NarrationBeats...)
	if s.Plan != nil && index == len(s.Scenes)-1 {
		if outro := strings.TrimSpace(s.Plan.NarrationArc.Outro); outro != "" && !contains(lines, outro) {
			lines = append(lines, outro)
		}
	}
	return lines
}

// pickLead chooses the lead-in line: the arc's per-beat transition, or the intro on
// the first scene.
func pickLead(arc NarrationArc, beat SceneBeat, index int) string {
	if t, ok := arc.Transitions[beat.ID]; ok && strings.TrimSpace(t) != "" {
		return strings.TrimSpace(t)
	}
	if index == 0 {
		return strings.TrimSpace(arc.Intro)
	}
	return ""
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// recapTail returns a copy of the last n recap entries (or fewer).
func recapTail(r []RecapEntry, n int) []RecapEntry {
	if len(r) <= n {
		return append([]RecapEntry(nil), r...)
	}
	return append([]RecapEntry(nil), r[len(r)-n:]...)
}
