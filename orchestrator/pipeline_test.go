package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
)

// pipelineEngine extends the selector stub with realistic assemble/render behavior:
// assemble hashes deterministically by scene seed; render returns a per-hash clip.
type pipelineEngine struct {
	stubEngine
	mu            sync.Mutex
	assembleCalls []AssembleRequest
}

func (e *pipelineEngine) Assemble(_ context.Context, req AssembleRequest) (AssembleResult, error) {
	e.mu.Lock()
	e.assembleCalls = append(e.assembleCalls, req)
	e.mu.Unlock()
	hash := fmt.Sprintf("hash-%d", req.Seed)
	return AssembleResult{OK: true, Spec: json.RawMessage(`{"specVersion":1}`), SpecHash: hash, DurationSec: 6}, nil
}

func (e *pipelineEngine) Render(_ context.Context, _ RenderRequest) (RenderResult, error) {
	return RenderResult{Video: ObjectRef{Key: "clips/clip.mp4"}, DurationSec: 6, Width: 1280, Height: 720, FPS: 30}, nil
}

func newTestPipeline(engine EngineClient) (*Pipeline, *InMemoryCheckpointStore) {
	cp := NewInMemoryCheckpointStore()
	return &Pipeline{
		Director: NewDirector(cp, nil),
		Planner:  StubPlanner{},
		Selector: NewKeywordSelector(engine),
		Engine:   engine,
	}, cp
}

func TestPipelineOfflineEndToEnd(t *testing.T) {
	engine := &pipelineEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p, cp := newTestPipeline(engine)

	s, err := p.Run(context.Background(), "job-1", ExternalRequest{
		Topic: "graphing lines",
		Query: "graph the line y = 2x + 1 on a coordinate plane",
	})
	if err != nil {
		t.Fatal(err)
	}

	if s.Phase != PhaseDone {
		t.Fatalf("want done, got %q (err=%+v)", s.Phase, s.Error)
	}
	if len(s.Scenes) != 4 {
		t.Fatalf("stub plan+endcard should have 4 scenes, got %d", len(s.Scenes))
	}
	// The main beat selected the graphing lesson with extracted slope/intercept.
	main := s.Scenes[1]
	if main.Placements[0].Builder != "math.graphingLesson" {
		t.Fatalf("main beat selection: %+v", main.Placements)
	}
	if main.Placements[0].Params["m"] != 2.0 {
		t.Fatalf("params not extracted: %+v", main.Placements[0].Params)
	}
	// Every scene assembled (distinct per-scene seeds -> distinct hashes) and rendered.
	seen := map[string]bool{}
	for i, sc := range s.Scenes {
		if sc.SpecHash == "" || sc.Render == nil || sc.Render.Clip == nil {
			t.Fatalf("scene %d incomplete: %+v", i, sc)
		}
		if seen[sc.SpecHash] {
			t.Fatalf("scene seeds must differ (duplicate hash %s)", sc.SpecHash)
		}
		seen[sc.SpecHash] = true
	}
	// Continuity: canvas locked once; recap grew one entry per scene.
	if s.Continuity.Canvas != DefaultCanvas {
		t.Fatalf("canvas not locked: %+v", s.Continuity.Canvas)
	}
	if len(s.Continuity.Recap) != 4 {
		t.Fatalf("recap entries: %d", len(s.Continuity.Recap))
	}
	// Final assembly summarizes offsets without a stitcher.
	if s.Final == nil || len(s.Final.SceneOffsets) != 4 || s.Final.DurationSec != 24 {
		t.Fatalf("final: %+v", s.Final)
	}
	if s.Final.SceneOffsets[3] != 18 {
		t.Fatalf("offsets should be cumulative: %+v", s.Final.SceneOffsets)
	}
	// The engine received the shared canvas + per-scene seeds.
	if engine.assembleCalls[0].Canvas != DefaultCanvas {
		t.Fatalf("assemble did not carry the canvas: %+v", engine.assembleCalls[0].Canvas)
	}
	// The whole run is checkpointed and reloadable.
	loaded, err := cp.Load(context.Background(), "job-1")
	if err != nil || loaded.Phase != PhaseDone {
		t.Fatalf("checkpoint reload: %v %+v", err, loaded)
	}
	// The end-card (P4): the appended last beat is items-hinted and carries the outro
	// narration; the keyword selector resolves it to the card with the title filled.
	last := s.Scenes[len(s.Scenes)-1]
	if last.Beat.DomainHint != DomainItems || len(last.Beat.NarrationBeats) == 0 {
		t.Fatalf("end-card beat malformed: %+v", last.Beat)
	}
	if last.Placements[0].Builder != "items.card" || last.Placements[0].Params["title"] == "" {
		t.Fatalf("end-card should select items.card with a title: %+v", last.Placements)
	}
}

func TestPipelineFailureIsRecordedInStore(t *testing.T) {
	engine := &pipelineEngine{stubEngine: stubEngine{tools: nil}} // empty catalog -> selector falls back; assemble still fine
	p, _ := newTestPipeline(engine)
	// Empty topic+query makes the stub planner fail.
	s, err := p.Run(context.Background(), "job-2", ExternalRequest{})
	if err == nil {
		t.Fatal("expected error")
	}
	if s.Phase != PhaseError || s.Error == nil || s.Error.Node != "pipeline" {
		t.Fatalf("failure not recorded: phase=%q err=%+v", s.Phase, s.Error)
	}
}
