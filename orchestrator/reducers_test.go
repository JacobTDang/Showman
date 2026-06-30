package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

type fixedClock struct{ t time.Time }

func (f fixedClock) Now() time.Time { return f.t }

func samplePlan(n int) LessonPlan {
	beats := make([]SceneBeat, n)
	for i := range beats {
		beats[i] = SceneBeat{ID: fmt.Sprintf("beat-%d", i+1), Index: i, Title: "t", Goal: "g"}
	}
	return LessonPlan{Title: "Lesson", Theme: "meadow", Scenes: beats}
}

func newTestDirector() (*Director, context.Context) {
	d := NewDirector(NewInMemoryCheckpointStore(), fixedClock{time.Unix(1000, 0)})
	return d, context.Background()
}

func TestPlanProducedInitializesScenes(t *testing.T) {
	d, ctx := newTestDirector()
	s := &JobContext{JobID: "j1", History: []NodeRunRecord{}}
	if err := d.Apply(ctx, s, PlanProduced{Plan: samplePlan(3)}); err != nil {
		t.Fatal(err)
	}
	if len(s.Scenes) != 3 {
		t.Fatalf("want 3 scenes, got %d", len(s.Scenes))
	}
	if s.Phase != PhaseSelecting {
		t.Fatalf("want phase %q, got %q", PhaseSelecting, s.Phase)
	}
	if s.Continuity.Theme != "meadow" {
		t.Fatalf("theme not propagated, got %q", s.Continuity.Theme)
	}
	if s.Scenes[2].Beat.ID != "beat-3" || s.Scenes[2].Outcome.Index != 2 {
		t.Fatalf("scene not initialized from beat: %+v", s.Scenes[2])
	}
	if len(s.History) != 1 || s.History[0].Kind != "PlanProduced" {
		t.Fatalf("audit history not recorded: %+v", s.History)
	}
	if !s.UpdatedAt.Equal(time.Unix(1000, 0)) {
		t.Fatalf("UpdatedAt not stamped from the injected clock: %v", s.UpdatedAt)
	}
}

func TestSceneBuiltAppendsRecapAndCommitsSpec(t *testing.T) {
	d, ctx := newTestDirector()
	s := &JobContext{JobID: "j1", History: []NodeRunRecord{}}
	mustApply(t, d, ctx, s, PlanProduced{Plan: samplePlan(2)})

	blob := json.RawMessage(`{"specVersion":1}`)
	mustApply(t, d, ctx, s, SceneBuilt{
		Index:    0,
		SpecHash: "abc",
		SpecBlob: blob,
		Recap:    RecapEntry{SceneIndex: 0, Takeaway: "we counted to three"},
		Outcome:  SceneOutcome{Index: 0, Source: SourceBuilder, Status: "ok"},
	})

	if s.Scenes[0].SpecHash != "abc" {
		t.Fatalf("spec hash not committed")
	}
	if string(s.Scenes[0].SpecBlob) != `{"specVersion":1}` {
		t.Fatalf("spec blob not committed: %s", s.Scenes[0].SpecBlob)
	}
	if len(s.Continuity.Recap) != 1 || s.Continuity.Recap[0].Takeaway != "we counted to three" {
		t.Fatalf("recap not appended: %+v", s.Continuity.Recap)
	}
	if s.Scenes[0].Outcome.Source != SourceBuilder {
		t.Fatalf("outcome not committed")
	}
}

func TestSceneRenderedCachedStatus(t *testing.T) {
	d, ctx := newTestDirector()
	s := &JobContext{JobID: "j1", History: []NodeRunRecord{}}
	mustApply(t, d, ctx, s, PlanProduced{Plan: samplePlan(1)})
	mustApply(t, d, ctx, s, SceneRendered{Index: 0, Clip: ObjectRef{Key: "clip0.mp4"}, DurationSec: 7.5, Cached: true})

	r := s.Scenes[0].Render
	if r == nil || r.Status != RenderCached || !r.Cached {
		t.Fatalf("render not recorded as cached: %+v", r)
	}
	if r.Clip == nil || r.Clip.Key != "clip0.mp4" {
		t.Fatalf("clip ref not recorded")
	}
}

func TestApplyOutOfRangeIndexErrorsAndDoesNotStamp(t *testing.T) {
	d, ctx := newTestDirector()
	s := &JobContext{JobID: "j1", History: []NodeRunRecord{}}
	mustApply(t, d, ctx, s, PlanProduced{Plan: samplePlan(1)})
	historyLen := len(s.History)

	err := d.Apply(ctx, s, SceneSelected{Index: 5, Placements: nil})
	if err == nil {
		t.Fatal("expected out-of-range error")
	}
	if len(s.History) != historyLen {
		t.Fatalf("history must not grow on a failed reducer: %d -> %d", historyLen, len(s.History))
	}
}

func TestApplyCheckpointsAfterEachDelta(t *testing.T) {
	cp := NewInMemoryCheckpointStore()
	d := NewDirector(cp, fixedClock{time.Unix(1000, 0)})
	ctx := context.Background()
	s := &JobContext{JobID: "j7", History: []NodeRunRecord{}}

	mustApply(t, d, ctx, s, PlanProduced{Plan: samplePlan(2)})
	loaded, err := cp.Load(ctx, "j7")
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Scenes) != 2 || loaded.Phase != PhaseSelecting {
		t.Fatalf("checkpoint did not capture the latest state: %+v", loaded)
	}
}

func mustApply(t *testing.T, d *Director, ctx context.Context, s *JobContext, delta Delta) {
	t.Helper()
	if err := d.Apply(ctx, s, delta); err != nil {
		t.Fatalf("apply %s: %v", delta.Kind(), err)
	}
}
