package orchestrator

import (
	"context"
	"testing"
	"time"
)

// newFileBackedServer builds a Server (+ Graph) over a FileCheckpointStore/FileByteStore
// rooted at dir, mirroring cmd/orchestrator's SHOWMAN_DATA_DIR wiring. A second call
// with the SAME dir models a process restart: no shared memory, only the files on disk.
func newFileBackedServer(t *testing.T, dir string) *Server {
	t.Helper()
	engine := &pipelineEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	cp := NewFileCheckpointStore(dir)
	p := &Pipeline{
		Director: NewDirector(cp, nil),
		Planner:  StubPlanner{},
		Selector: NewKeywordSelector(engine),
		Engine:   engine,
	}
	graph, err := BuildGenerateGraph(context.Background(), p, NewFileByteStore(dir))
	if err != nil {
		t.Fatal(err)
	}
	return &Server{Pipeline: p, Graph: graph, Checkpoint: cp}
}

func TestCrashResumeRedrivesInFlightJobsOnBoot(t *testing.T) {
	dir := t.TempDir()
	ctx := context.Background()

	// "Before restart": a job is queued (seeded, never run — as if the process died
	// the instant after accepting it, before the pipeline goroutine made progress).
	before := newFileBackedServer(t, dir)
	req := ExternalRequest{Topic: "counting", Query: "count to 3"}
	seed, err := NewJobContext("job-inflight", req, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if err := before.Checkpoint.Save(ctx, seed); err != nil {
		t.Fatal(err)
	}

	// A job that's already finished must be left alone (no re-drive, no side effects).
	doneSeed, _ := NewJobContext("job-done", req, time.Now())
	doneSeed.Phase = PhaseDone
	doneSeed.Final = &FinalAssembly{VideoKey: "x", DurationSec: 1}
	if err := before.Checkpoint.Save(ctx, doneSeed); err != nil {
		t.Fatal(err)
	}

	// A job legitimately awaiting human review must be left alone too.
	gatedSeed, _ := NewJobContext("job-gated", req, time.Now())
	gatedSeed.Phase = PhaseRendering
	gatedSeed.Resume = &ResumeState{Token: "some-token", At: time.Now()}
	if err := before.Checkpoint.Save(ctx, gatedSeed); err != nil {
		t.Fatal(err)
	}

	// "After restart": a brand-new Server + Graph, same directory.
	after := newFileBackedServer(t, dir)
	resumed, err := after.ResumeIncompleteJobs(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if resumed != 1 {
		t.Fatalf("want exactly 1 job re-driven (the in-flight one), got %d", resumed)
	}

	deadline := time.Now().Add(10 * time.Second)
	for {
		view, err := after.Checkpoint.Load(ctx, "job-inflight")
		if err != nil {
			t.Fatal(err)
		}
		if view.Phase == PhaseDone {
			break
		}
		if view.Phase == PhaseError {
			t.Fatalf("crash-resumed job errored: %+v", view.Error)
		}
		if time.Now().After(deadline) {
			t.Fatalf("crash-resumed job never finished: %+v", view)
		}
		time.Sleep(20 * time.Millisecond)
	}

	// The other two must be untouched by the scan.
	stillDone, _ := after.Checkpoint.Load(ctx, "job-done")
	if stillDone.Phase != PhaseDone {
		t.Fatalf("a done job must not be re-driven: %+v", stillDone)
	}
	stillGated, _ := after.Checkpoint.Load(ctx, "job-gated")
	if stillGated.Resume == nil || stillGated.Resume.ResumedAt != nil {
		t.Fatalf("an awaiting-review job must not be auto-resumed: %+v", stillGated.Resume)
	}
}

func TestCrashResumeIsANoOpWithoutAJobLister(t *testing.T) {
	s, _ := newTestServer() // in-memory checkpoint: does not implement JobLister
	n, err := s.ResumeIncompleteJobs(context.Background())
	if err != nil || n != 0 {
		t.Fatalf("want a silent no-op for a non-listable store, got n=%d err=%v", n, err)
	}
}
