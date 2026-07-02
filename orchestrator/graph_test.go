package orchestrator

import (
	"context"
	"testing"
)

func newTestGraph(t *testing.T, previewGate bool) (*GenerateGraph, *Pipeline, *InMemoryCheckpointStore) {
	t.Helper()
	engine := &pipelineEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p, cp := newTestPipeline(engine)
	_ = previewGate
	gg, err := BuildGenerateGraph(context.Background(), p, NewEinoByteStore())
	if err != nil {
		t.Fatal(err)
	}
	return gg, p, cp
}

func TestGraphRunMatchesPipelineRun(t *testing.T) {
	req := ExternalRequest{Topic: "fractions", Query: "show the fraction 3/4 as a pie"}

	// Pipeline path.
	engine1 := &pipelineEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p1, _ := newTestPipeline(engine1)
	fromPipeline, err := p1.Run(context.Background(), "job-eq", req)
	if err != nil {
		t.Fatal(err)
	}

	// Graph path.
	gg, _, _ := newTestGraph(t, false)
	fromGraph, interrupt, err := gg.Run(context.Background(), GraphInput{JobID: "job-eq", Request: req})
	if err != nil || interrupt != nil {
		t.Fatalf("graph run: err=%v interrupt=%+v", err, interrupt)
	}

	// Same phase, same scene count, same per-scene spec hashes, same offsets.
	if fromGraph.Phase != PhaseDone || fromPipeline.Phase != PhaseDone {
		t.Fatalf("phases: graph=%q pipeline=%q", fromGraph.Phase, fromPipeline.Phase)
	}
	if len(fromGraph.Scenes) != len(fromPipeline.Scenes) {
		t.Fatalf("scene counts: graph=%d pipeline=%d", len(fromGraph.Scenes), len(fromPipeline.Scenes))
	}
	for i := range fromGraph.Scenes {
		if fromGraph.Scenes[i].SpecHash != fromPipeline.Scenes[i].SpecHash {
			t.Fatalf("scene %d hash: graph=%s pipeline=%s", i, fromGraph.Scenes[i].SpecHash, fromPipeline.Scenes[i].SpecHash)
		}
	}
	if len(fromGraph.Final.SceneOffsets) != len(fromPipeline.Final.SceneOffsets) {
		t.Fatalf("offsets differ")
	}
}

func TestGraphPreviewGateInterruptsAndResumes(t *testing.T) {
	gg, _, _ := newTestGraph(t, true)
	req := ExternalRequest{
		Topic: "fractions", Query: "show the fraction 3/4 as a pie",
		Options: GenerateVideoOptions{PreviewGate: true},
	}

	// First run interrupts at the gate — scenes rendered, nothing stitched yet.
	s, interrupt, err := gg.Run(context.Background(), GraphInput{JobID: "job-gate", Request: req})
	if err != nil {
		t.Fatal(err)
	}
	if s != nil || interrupt == nil {
		t.Fatalf("expected an interrupt, got store=%v interrupt=%v", s, interrupt)
	}
	if len(interrupt.InterruptContexts) == 0 {
		t.Fatalf("interrupt carries no contexts: %+v", interrupt)
	}
	root := interrupt.InterruptContexts[0]
	view, ok := root.Info.(JobView)
	if !ok {
		t.Fatalf("interrupt info should be the JobView, got %T", root.Info)
	}
	if len(view.Scenes) == 0 {
		t.Fatalf("gate view should show the rendered scenes: %+v", view)
	}

	// Resume from the checkpoint completes the job.
	done, err := gg.Resume(context.Background(), "job-gate", root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if done.Phase != PhaseDone || done.Final == nil {
		t.Fatalf("resume did not finish the job: phase=%q final=%+v", done.Phase, done.Final)
	}
}
