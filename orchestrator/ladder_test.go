package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
)

// flakyEngine fails Assemble for one specific builder (the graphing lesson), so the
// ladder must re-correct and then drop that scene to the fallback card while other
// scenes proceed normally.
type flakyEngine struct {
	stubEngine
	mu               sync.Mutex
	assembleAttempts int
}

func (e *flakyEngine) Assemble(_ context.Context, req AssembleRequest) (AssembleResult, error) {
	e.mu.Lock()
	e.assembleAttempts++
	e.mu.Unlock()
	for _, p := range req.Placements {
		if p.Builder == "math.graphingLesson" {
			return AssembleResult{OK: false, Errors: []ValidationError{{Path: "placements", Code: "INVALID_PARAMS", Message: "bad params for " + p.Builder}}}, nil
		}
	}
	return AssembleResult{OK: true, Spec: json.RawMessage(`{"specVersion":1}`), SpecHash: fmt.Sprintf("ok-%d", req.Seed), DurationSec: 5}, nil
}

func (e *flakyEngine) Render(_ context.Context, _ RenderRequest) (RenderResult, error) {
	return RenderResult{Video: ObjectRef{Key: "clips/x.mp4"}, DurationSec: 5, Width: 1280, Height: 720, FPS: 30}, nil
}

func TestLadderDegradesToCardInsteadOfFailingJob(t *testing.T) {
	engine := &flakyEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p, _ := newTestPipeline(engine)
	p.Engine = engine
	p.Selector = NewKeywordSelector(engine)

	s, err := p.Run(context.Background(), "job-ladder", ExternalRequest{
		Topic: "shapes", Query: "graph the line y = 2x + 1",
		Options: GenerateVideoOptions{MaxScenes: 1}, // single beat -> would have killed the job before
	})
	// The job must NOT fail: it ships a degraded card scene... unless ALL scenes
	// degraded — with MaxScenes=1 that's the all-degraded case, which fails by design.
	if err == nil {
		t.Fatalf("single-scene all-degraded should fail; got phase %q", s.Phase)
	}
	if !strings.Contains(err.Error(), "degraded") {
		t.Fatalf("unexpected failure reason: %v", err)
	}

	// With 3 beats (topic "shapes" -> intro/recap select the geometry lesson and
	// succeed; the main beat selects the graphing lesson and degrades to a card), the
	// job completes with one degraded scene riding along.
	engine2 := &flakyEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p2, _ := newTestPipeline(engine2)
	p2.Engine = engine2
	p2.Selector = NewKeywordSelector(engine2)
	s2, err := p2.Run(context.Background(), "job-ladder-3", ExternalRequest{Topic: "shapes", Query: "graph the line y = 2x + 1"})
	if err != nil {
		t.Fatalf("multi-scene job must survive one degraded scene: %v", err)
	}
	if s2.Phase != PhaseDone {
		t.Fatalf("want done, got %q", s2.Phase)
	}
	main := s2.Scenes[1]
	if !main.Outcome.Degraded || main.Outcome.Source != SourceFallback || main.Outcome.Rung != 8 {
		t.Fatalf("main scene should be a degraded fallback: %+v", main.Outcome)
	}
	if main.Placements[0].Builder != "items.card" {
		t.Fatalf("main scene should carry the card placement: %+v", main.Placements)
	}
	if main.Render == nil || main.Render.Clip == nil {
		t.Fatalf("degraded scene must still render: %+v", main.Render)
	}
	for _, i := range []int{0, 2, 3} {
		if s2.Scenes[i].Outcome.Degraded {
			t.Fatalf("scene %d should have succeeded: %+v", i, s2.Scenes[i].Outcome)
		}
	}
	if len(s2.Warnings) == 0 {
		t.Fatal("the degradation must be recorded as a warning")
	}
	// The re-correct rung ran on the main scene: fail + re-correct fail + card.
	if engine2.assembleAttempts < 5 {
		t.Fatalf("expected re-correct + card attempts, got %d", engine2.assembleAttempts)
	}
}

func TestPoliciesFeedBackThenWarn(t *testing.T) {
	beat := SceneBeat{Forbid: []string{"numberline"}, MustShow: []string{"fraction"}}
	bad := []BuilderPlacement{{Builder: "math.numberLine", Params: map[string]any{}}}
	errs := checkPolicies(beat, bad)
	if len(errs) != 2 {
		t.Fatalf("want forbid+mustShow violations, got %+v", errs)
	}
	good := []BuilderPlacement{{Builder: "math.fractionLesson", Params: map[string]any{"numerator": 3}}}
	if got := checkPolicies(beat, good); len(got) != 0 {
		t.Fatalf("expected clean, got %+v", got)
	}
}

func TestFanOutCompletesAllScenes(t *testing.T) {
	engine := &pipelineEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p, cp := newTestPipeline(engine)
	p.Concurrency = 3
	s, err := p.Run(context.Background(), "job-fan", ExternalRequest{Topic: "counting", Query: "count to 5"})
	if err != nil {
		t.Fatal(err)
	}
	if s.Phase != PhaseDone {
		t.Fatalf("want done, got %q", s.Phase)
	}
	for i, sc := range s.Scenes {
		if sc.Render == nil || sc.Render.Clip == nil {
			t.Fatalf("scene %d not rendered under fan-out", i)
		}
	}
	// Deltas serialized: the checkpoint reloads cleanly with every scene present.
	loaded, err := cp.Load(context.Background(), "job-fan")
	if err != nil || len(loaded.Scenes) != 4 {
		t.Fatalf("checkpoint after fan-out: %v %+v", err, loaded)
	}
}
