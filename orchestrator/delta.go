package orchestrator

import (
	"encoding/json"
	"fmt"
)

// Delta is a typed, serializable mutation intent. Nodes never mutate the store directly;
// they return a Delta and the single-writer Director folds it in via apply (the reducer).
// This gives auditability, single-writer safety, and deterministic resume.
type Delta interface {
	// Kind is a stable name for the delta (recorded in the audit history).
	Kind() string
	// apply is the reducer: a controlled, typed mutation of the store. Unexported so the
	// Director is the only caller (writes go through Director.Apply).
	apply(*JobContext) error
}

// PhaseAdvanced moves the job to a new phase (monotonic; the reducer does not police
// ordering — the Director drives phases in order by construction).
type PhaseAdvanced struct{ Phase JobPhase }

func (PhaseAdvanced) Kind() string { return "PhaseAdvanced" }

func (d PhaseAdvanced) apply(s *JobContext) error {
	s.Phase = d.Phase
	return nil
}

// PlanProduced installs the lesson plan, locks the shared canvas, and initializes one
// SceneState per beat.
type PlanProduced struct {
	Plan   LessonPlan
	Canvas Canvas
}

func (PlanProduced) Kind() string { return "PlanProduced" }

func (d PlanProduced) apply(s *JobContext) error {
	plan := d.Plan
	s.Plan = &plan
	s.Scenes = make([]SceneState, len(plan.Scenes))
	for i, b := range plan.Scenes {
		s.Scenes[i] = SceneState{Index: i, Beat: b, Outcome: SceneOutcome{Index: i}}
	}
	if plan.Theme != "" {
		s.Continuity.Theme = plan.Theme
	}
	if d.Canvas != (Canvas{}) {
		s.Continuity.Canvas = d.Canvas
	}
	s.Phase = PhaseSelecting
	return nil
}

// SceneSelected records the Domain Selector's builder placements for a scene.
type SceneSelected struct {
	Index      int
	Placements []BuilderPlacement
}

func (SceneSelected) Kind() string { return "SceneSelected" }

func (d SceneSelected) apply(s *JobContext) error {
	if err := checkIndex(s, d.Index); err != nil {
		return err
	}
	s.Scenes[d.Index].Placements = d.Placements
	return nil
}

// SceneBuilt records an assembled, validated SceneSpec for a scene and appends its recap.
// Continuity is committed here (the Selector proposes; the Assembler commits).
type SceneBuilt struct {
	Index    int
	SpecHash string
	SpecBlob json.RawMessage
	Recap    RecapEntry
	Outcome  SceneOutcome
}

func (SceneBuilt) Kind() string { return "SceneBuilt" }

func (d SceneBuilt) apply(s *JobContext) error {
	if err := checkIndex(s, d.Index); err != nil {
		return err
	}
	sc := &s.Scenes[d.Index]
	sc.SpecHash = d.SpecHash
	sc.SpecBlob = string(d.SpecBlob)
	sc.Outcome = d.Outcome
	s.Continuity.Recap = append(s.Continuity.Recap, d.Recap)
	return nil
}

// SceneRendered records a scene's rendered clip + narration audio.
type SceneRendered struct {
	Index        int
	Clip         ObjectRef
	NarrationWav *ObjectRef
	DurationSec  float64
	Cached       bool
}

func (SceneRendered) Kind() string { return "SceneRendered" }

func (d SceneRendered) apply(s *JobContext) error {
	if err := checkIndex(s, d.Index); err != nil {
		return err
	}
	status := RenderDone
	if d.Cached {
		status = RenderCached
	}
	clip := d.Clip
	s.Scenes[d.Index].Render = &SceneRender{
		Status:       status,
		Clip:         &clip,
		NarrationWav: d.NarrationWav,
		DurationSec:  d.DurationSec,
		Cached:       d.Cached,
	}
	return nil
}

// SceneFellBack marks a scene as degraded to a fallback card and logs a warning.
type SceneFellBack struct {
	Index   int
	Reason  string
	Outcome SceneOutcome
}

func (SceneFellBack) Kind() string { return "SceneFellBack" }

func (d SceneFellBack) apply(s *JobContext) error {
	if err := checkIndex(s, d.Index); err != nil {
		return err
	}
	s.Scenes[d.Index].Outcome = d.Outcome
	if d.Reason != "" {
		s.Warnings = append(s.Warnings, d.Reason)
	}
	return nil
}

// BeatRevised replaces a degraded scene's beat with the planner's revised version
// (Roadmap C3: the one bounded re-plan rung) and resets everything downstream of the
// beat — placements, spec, render, outcome, attempts — back to zero so runScene
// genuinely starts over: select -> assemble -> render against the NEW beat, not a
// stale mix of old placements and new goals.
type BeatRevised struct {
	Index int
	Beat  SceneBeat
}

func (BeatRevised) Kind() string { return "BeatRevised" }

func (d BeatRevised) apply(s *JobContext) error {
	if err := checkIndex(s, d.Index); err != nil {
		return err
	}
	sc := &s.Scenes[d.Index]
	sc.Beat = d.Beat
	sc.Placements = nil
	sc.SpecHash = ""
	sc.SpecBlob = ""
	sc.Narration = SceneNarration{}
	sc.Render = nil
	sc.Outcome = SceneOutcome{}
	sc.Attempts = 0
	return nil
}

// JobFinalized installs the stitched final video and completes the job.
type JobFinalized struct{ Final FinalAssembly }

func (JobFinalized) Kind() string { return "JobFinalized" }

func (d JobFinalized) apply(s *JobContext) error {
	final := d.Final
	s.Final = &final
	s.Phase = PhaseDone
	return nil
}

// JobFailed terminates the job with an error.
type JobFailed struct{ Err JobError }

func (JobFailed) Kind() string { return "JobFailed" }

func (d JobFailed) apply(s *JobContext) error {
	err := d.Err
	s.Error = &err
	s.Phase = PhaseError
	return nil
}

func checkIndex(s *JobContext, i int) error {
	if i < 0 || i >= len(s.Scenes) {
		return fmt.Errorf("scene index %d out of range (have %d scenes)", i, len(s.Scenes))
	}
	return nil
}
