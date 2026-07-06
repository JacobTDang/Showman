package orchestrator

import (
	"context"
	"testing"
)

// refSelector registers a NEW entity on beat-1, then has beat-2 reuse it by ref
// alone (no builder/params of its own) — the shape Roadmap C4's acceptance test
// asks for: "beat 2 refs beat 1's molecule -> identical node." Every other beat
// gets a normal, always-buildable placement (unrelated to the reuse scenario).
type refSelector struct{}

func (refSelector) Select(_ context.Context, view SelectorView) ([]BuilderPlacement, error) {
	switch view.Beat.ID {
	case "beat-1":
		return []BuilderPlacement{{Builder: "chem.molecule", Params: map[string]any{"name": "water"}, Ref: "molecule-1"}}, nil
	case "beat-2":
		return []BuilderPlacement{{Ref: "molecule-1"}}, nil
	default:
		return []BuilderPlacement{{Builder: "math.countingLesson", Params: map[string]any{}}}, nil
	}
}

// twoBeatEntityPlan is a fixed plan with an EXPLICIT dependency: beat-2 depends on
// beat-1, which is what runScenes' dependency-respecting fan-out (see
// dependencyIndex in pipeline.go) uses to guarantee beat-1 registers its entity
// before beat-2's selector call ever runs — without this, the two scenes could run
// concurrently and beat-2 could race ahead of the registration.
type twoBeatEntityPlanner struct{}

func (twoBeatEntityPlanner) Plan(_ context.Context, view PlannerView) (LessonPlan, error) {
	return LessonPlan{
		Title: "Water", Theme: "sunshine", Throughline: view.Request.Query, Goals: []string{view.Request.Query},
		Scenes: []SceneBeat{
			{ID: "beat-1", Index: 0, Title: "Molecule", Goal: "show the water molecule", NarrationBeats: []string{"Here is water."}, DurationBudgetSec: 8},
			{ID: "beat-2", Index: 1, Title: "Same molecule", Goal: "show it again", NarrationBeats: []string{"Same molecule again."}, DurationBudgetSec: 8, DependsOn: []string{"beat-1"}},
		},
	}, nil
}

func TestEntityReuseAcrossBeats(t *testing.T) {
	engine := &pipelineEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p, _ := newTestPipeline(engine)
	p.Planner = twoBeatEntityPlanner{}
	p.Selector = refSelector{}

	s, err := p.Run(context.Background(), "job-entity", ExternalRequest{Topic: "water", Query: "the water molecule"})
	if err != nil {
		t.Fatalf("job should complete: %v", err)
	}
	if s.Phase != PhaseDone {
		t.Fatalf("want done, got %q", s.Phase)
	}
	if len(s.Scenes) < 2 {
		t.Fatalf("want at least the 2 planned scenes (plus the auto-appended end card), got %d", len(s.Scenes))
	}

	// Beat 1 registered the entity under its ref.
	ent, ok := s.Continuity.Entities["molecule-1"]
	if !ok {
		t.Fatalf("entity was never registered: %+v", s.Continuity.Entities)
	}
	if ent.Builder != "chem.molecule" || ent.Params["name"] != "water" {
		t.Fatalf("registered entity has the wrong builder/params: %+v", ent)
	}

	// Beat 2's ref-only placement resolved to the IDENTICAL builder and params —
	// same builder+params -> same pixels, via the engine's determinism.
	got := s.Scenes[1].Placements[0]
	if got.Builder != "chem.molecule" {
		t.Fatalf("beat 2's ref did not resolve to the registered builder: %+v", got)
	}
	if got.Params["name"] != "water" {
		t.Fatalf("beat 2's ref did not resolve to the registered params: %+v", got)
	}
}

// emptyBuilderRejectingEngine fails Assemble whenever a placement has no builder
// name — standing in for the real engine's Zod validation (which the permissive
// pipelineEngine/flakyEngine stubs don't model), so a dangling/unresolved ref
// actually exercises the failure ladder instead of trivially "succeeding."
type emptyBuilderRejectingEngine struct{ stubEngine }

func (e *emptyBuilderRejectingEngine) Assemble(_ context.Context, req AssembleRequest) (AssembleResult, error) {
	for _, p := range req.Placements {
		if p.Builder == "" {
			return AssembleResult{OK: false, Errors: []ValidationError{{Path: "placements", Code: "INVALID_VALUE", Message: "unknown builder \"\""}}}, nil
		}
	}
	return AssembleResult{OK: true, Spec: []byte(`{"specVersion":1}`), SpecHash: "ok", DurationSec: 5}, nil
}

func (e *emptyBuilderRejectingEngine) Render(_ context.Context, _ RenderRequest) (RenderResult, error) {
	return RenderResult{Video: ObjectRef{Key: "clips/x.mp4"}, DurationSec: 5, Width: 1280, Height: 720, FPS: 30}, nil
}

// TestEntityReuseUnresolvedRefFallsBackGracefully: a ref that was never registered
// leaves the builder empty, which the assembler rejects — the normal failure ladder
// (re-correct -> fallback card) already handles that, so the job still completes
// (degraded) rather than crashing on a dangling reference.
func TestEntityReuseUnresolvedRefFallsBackGracefully(t *testing.T) {
	engine := &emptyBuilderRejectingEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p, _ := newTestPipeline(engine)
	p.Selector = danglingRefSelector{}

	s, err := p.Run(context.Background(), "job-dangling-ref", ExternalRequest{Topic: "water", Query: "the water molecule"})
	if err != nil {
		t.Fatalf("job should still complete via the fallback card: %v", err)
	}
	if s.Phase != PhaseDone {
		t.Fatalf("want done, got %q", s.Phase)
	}
	if !s.Scenes[1].Outcome.Degraded {
		t.Fatalf("the dangling ref should have degraded to a fallback card: %+v", s.Scenes[1].Outcome)
	}
}

// danglingRefSelector only sends a dangling ref on the main beat (index 1) — every
// other beat gets a normal, always-buildable placement, so the job survives with
// exactly one degraded scene instead of hitting the all-degraded failure case.
type danglingRefSelector struct{}

func (danglingRefSelector) Select(_ context.Context, view SelectorView) ([]BuilderPlacement, error) {
	if view.Beat.Index == 1 {
		return []BuilderPlacement{{Ref: "never-registered"}}, nil
	}
	return []BuilderPlacement{{Builder: "math.countingLesson", Params: map[string]any{}}}, nil
}
