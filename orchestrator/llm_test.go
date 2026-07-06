package orchestrator

import (
	"context"
	"testing"

	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

// fakeChat returns canned responses in order (repeating the last).
type fakeChat struct {
	responses []string
	calls     int
}

func (f *fakeChat) Generate(_ context.Context, _ []*schema.Message, _ ...model.Option) (*schema.Message, error) {
	i := f.calls
	if i >= len(f.responses) {
		i = len(f.responses) - 1
	}
	f.calls++
	return schema.AssistantMessage(f.responses[i], nil), nil
}

func (f *fakeChat) Stream(_ context.Context, _ []*schema.Message, _ ...model.Option) (*schema.StreamReader[*schema.Message], error) {
	panic("not used")
}

const goodPlanJSON = `Here is your plan:
` + "```json" + `
{"title":"Fractions!","theme":"ocean","throughline":"parts of a whole",
 "goals":["understand 3/4"],
 "scenes":[
   {"id":"x","index":5,"title":"Intro","goal":"introduce fractions","narrationBeats":["hi"],"durationBudgetSec":0},
   {"id":"y","index":9,"title":"Main","goal":"show 3/4 as a pie","domainHint":"math","narrationBeats":["look"],"durationBudgetSec":120}
 ],
 "narrationArc":{"intro":"hello","outro":"bye"}}
` + "```"

func TestLLMPlannerParsesAndNormalizes(t *testing.T) {
	p := &LLMPlanner{Model: &fakeChat{responses: []string{goodPlanJSON}}}
	plan, err := p.Plan(context.Background(), PlannerView{
		Request:       ExternalRequest{Topic: "fractions", Query: "show 3/4"},
		DefaultBudget: 60,
	})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Theme != "ocean" || len(plan.Scenes) != 2 {
		t.Fatalf("plan not parsed: %+v", plan)
	}
	// Normalization: ids/indexes resequenced, out-of-range durations replaced.
	if plan.Scenes[0].ID != "beat-1" || plan.Scenes[0].Index != 0 || plan.Scenes[1].Index != 1 {
		t.Fatalf("ids/indexes not normalized: %+v", plan.Scenes)
	}
	for _, sc := range plan.Scenes {
		if sc.DurationBudgetSec < 3 || sc.DurationBudgetSec > 30 {
			t.Fatalf("duration not normalized: %+v", sc)
		}
	}
}

func TestSmoothDurationsEvensRaggedBudgets(t *testing.T) {
	// The observed live raggedness: 20 / 4.8 / 30 against a 60s budget.
	scenes := []SceneBeat{{DurationBudgetSec: 20}, {DurationBudgetSec: 4.8}, {DurationBudgetSec: 30}}
	smoothDurations(scenes, 60)
	minD, maxD, sum := scenes[0].DurationBudgetSec, scenes[0].DurationBudgetSec, 0.0
	for _, sc := range scenes {
		if sc.DurationBudgetSec < minD {
			minD = sc.DurationBudgetSec
		}
		if sc.DurationBudgetSec > maxD {
			maxD = sc.DurationBudgetSec
		}
		sum += sc.DurationBudgetSec
	}
	if maxD/minD > 3.0 {
		t.Fatalf("still ragged after smoothing: min=%.1f max=%.1f", minD, maxD)
	}
	if sum < 45 || sum > 75 {
		t.Fatalf("total drifted from the 60s budget: %.1f", sum)
	}
	// Degenerate inputs are safe no-ops.
	smoothDurations(nil, 60)
	smoothDurations([]SceneBeat{{DurationBudgetSec: 10}}, 0)
}

func TestLLMPlannerRejectsGarbage(t *testing.T) {
	p := &LLMPlanner{Model: &fakeChat{responses: []string{"I cannot help with that."}}}
	if _, err := p.Plan(context.Background(), PlannerView{DefaultBudget: 60}); err == nil {
		t.Fatal("expected error for non-JSON output")
	}
	bad := &LLMPlanner{Model: &fakeChat{responses: []string{`{"title":"x","scenes":[]}`}}}
	if _, err := bad.Plan(context.Background(), PlannerView{DefaultBudget: 60}); err == nil {
		t.Fatal("expected error for zero scenes")
	}
}

func TestLLMSelectorValidatesAgainstCatalog(t *testing.T) {
	engine := &stubEngine{tools: realishCatalog()}
	good := &LLMSelector{Engine: engine, Model: &fakeChat{responses: []string{
		`[{"builder":"math.fractionLesson","params":{"numerator":3,"denominator":4}}]`,
	}}}
	placements, err := good.Select(context.Background(), SelectorView{Beat: SceneBeat{Goal: "3/4"}})
	if err != nil {
		t.Fatal(err)
	}
	if placements[0].Builder != "math.fractionLesson" || placements[0].Params["numerator"] != 3.0 {
		t.Fatalf("placements wrong: %+v", placements)
	}

	// A single object (not array) is tolerated.
	single := &LLMSelector{Engine: engine, Model: &fakeChat{responses: []string{
		`{"builder":"math.numberLine","params":{"from":0,"to":10}}`,
	}}}
	one, err := single.Select(context.Background(), SelectorView{Beat: SceneBeat{Goal: "line"}})
	if err != nil || one[0].Builder != "math.numberLine" {
		t.Fatalf("single-object tolerance failed: %v %+v", err, one)
	}

	// Unknown builder names fail fast (before /assemble).
	hallucinated := &LLMSelector{Engine: engine, Model: &fakeChat{responses: []string{
		`[{"builder":"math.doesNotExist","params":{}}]`,
	}}}
	if _, err := hallucinated.Select(context.Background(), SelectorView{}); err == nil {
		t.Fatal("expected error for hallucinated builder")
	}
}

func TestFallbackTiers(t *testing.T) {
	ctx := context.Background()

	// Planner: LLM garbage -> stub plan.
	fp := FallbackPlanner{Tiers: []LessonPlanner{
		&LLMPlanner{Model: &fakeChat{responses: []string{"nope"}}},
		StubPlanner{},
	}}
	plan, err := fp.Plan(ctx, PlannerView{Request: ExternalRequest{Topic: "counting", Query: "count to 3"}, DefaultBudget: 60})
	if err != nil || plan.ModelID != "stub-planner/v1" {
		t.Fatalf("planner fallback failed: %v %+v", err, plan.ModelID)
	}

	// Selector: hallucinating LLM -> keyword tier.
	engine := &stubEngine{tools: realishCatalog()}
	fs := FallbackSelector{Tiers: []DomainSelector{
		&LLMSelector{Engine: engine, Model: &fakeChat{responses: []string{`[{"builder":"nope","params":{}}]`}}},
		NewKeywordSelector(engine),
	}}
	placements, err := fs.Select(ctx, SelectorView{Beat: SceneBeat{Goal: "show the fraction 3/4 as a pie"}})
	if err != nil || placements[0].Builder != "math.fractionLesson" {
		t.Fatalf("selector fallback failed: %v %+v", err, placements)
	}
}

func TestExtractJSONShapes(t *testing.T) {
	if _, err := extractJSON("no json at all"); err == nil {
		t.Fatal("expected error")
	}
	arr, err := extractJSON("prefix [1,2,3] suffix")
	if err != nil || string(arr) != "[1,2,3]" {
		t.Fatalf("array slice failed: %v %s", err, arr)
	}
	obj, err := extractJSON(`text {"a":"}"} more`)
	if err != nil || string(obj) != `{"a":"}"}` {
		t.Fatalf("string-aware slice failed: %v %s", err, obj)
	}
}
