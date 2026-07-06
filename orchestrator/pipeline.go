package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Pipeline drives one generate job through plan -> select -> assemble -> render, with
// every store write flowing through Director.Apply (typed deltas, audited, checkpointed).
// Stitching (ffmpeg concat + narration mux) is the next stage and attaches behind
// Stitcher; until one is configured the job completes at "rendered clips".
type Pipeline struct {
	Director *Director
	Planner  LessonPlanner
	Selector DomainSelector
	Engine   EngineClient
	// Stitcher, when set, concatenates the rendered clips into the final video.
	Stitcher Stitcher
	// Canvas defaults every scene's dims. Zero value -> 1280x720@30.
	Canvas Canvas
	// Concurrency bounds the per-scene fan-out. Zero -> 3.
	Concurrency int
}

// Stitcher turns rendered scene clips into one final video (ffmpeg concat + mux).
type Stitcher interface {
	Stitch(ctx context.Context, s *JobContext) (FinalAssembly, error)
}

// DefaultCanvas is the single shared canvas when none is configured.
var DefaultCanvas = Canvas{Width: 1280, Height: 720, FPS: 30}

// Run executes the job to completion (or error). It creates the JobContext, folds every
// node output in via typed deltas, and returns the final store.
func (p *Pipeline) Run(ctx context.Context, jobID string, req ExternalRequest) (*JobContext, error) {
	s, err := NewJobContext(jobID, req, time.Now())
	if err != nil {
		return nil, err
	}
	if err := p.run(ctx, s); err != nil {
		// Terminal failure: record it in the store too, so poll/resume sees it.
		_ = p.Director.Apply(ctx, s, JobFailed{Err: JobError{Node: "pipeline", Message: err.Error(), Retryable: false}})
		return s, err
	}
	return s, nil
}

func (p *Pipeline) run(ctx context.Context, s *JobContext) error {
	canvas := p.Canvas
	if canvas.Width == 0 || canvas.Height == 0 || canvas.FPS == 0 {
		canvas = DefaultCanvas
	}

	// 1. Plan.
	if err := p.Director.Apply(ctx, s, PhaseAdvanced{Phase: PhasePlanning}); err != nil {
		return err
	}
	plan, err := p.Planner.Plan(ctx, PlanView(s))
	if err != nil {
		return fmt.Errorf("plan: %w", err)
	}
	if len(plan.Scenes) == 0 {
		return fmt.Errorf("plan: produced zero scenes")
	}
	plan = appendEndCard(plan)
	if err := p.Director.Apply(ctx, s, PlanProduced{Plan: plan, Canvas: canvas}); err != nil {
		return err
	}

	// 2..4 per scene: select -> assemble -> render, with the per-scene failure ladder
	// (re-correct -> fallback card) and bounded fan-out. Deltas serialize through the
	// Director's mutex; engine-side render caching keeps retries cheap.
	if err := p.runScenes(ctx, s); err != nil {
		return err
	}

	// The job fails wholesale only when EVERY scene degraded to a fallback card.
	if len(s.Scenes) > 0 && allDegraded(s.Scenes) {
		return fmt.Errorf("all %d scenes degraded to fallback cards", len(s.Scenes))
	}

	// C3: one bounded re-plan rung. Only when the LLM actually produced this plan
	// (ModelID carries the tier that won) — offline tiers never revise, since
	// there's no model call to make a better second attempt with. Best-effort: a
	// failed revision just leaves the fallback cards already in place (any store
	// mutation still goes through Director.Apply, never a direct field write, so
	// there's nothing unsafe to roll back).
	if s.Plan != nil && strings.HasPrefix(s.Plan.ModelID, "llm-") {
		_ = p.reviseDegraded(ctx, s)
	}

	// 5. Stitch (when configured).
	if p.Stitcher != nil {
		if err := p.Director.Apply(ctx, s, PhaseAdvanced{Phase: PhaseStitching}); err != nil {
			return err
		}
		final, err := p.Stitcher.Stitch(ctx, s)
		if err != nil {
			return fmt.Errorf("stitch: %w", err)
		}
		return p.Director.Apply(ctx, s, JobFinalized{Final: final})
	}

	// No stitcher yet: the job is complete at "rendered clips" (offsets still computed).
	return p.Director.Apply(ctx, s, JobFinalized{Final: clipsOnlyAssembly(s)})
}

// runScenes fans the per-scene work out with bounded concurrency and returns the first
// hard error (ladder-exhausted scenes degrade instead of erroring).
func (p *Pipeline) runScenes(ctx context.Context, s *JobContext) error {
	concurrency := p.Concurrency
	if concurrency <= 0 {
		concurrency = 3
	}
	sem := make(chan struct{}, concurrency)
	errs := make(chan error, len(s.Scenes))
	var wg sync.WaitGroup
	for i := range s.Scenes {
		wg.Add(1)
		sem <- struct{}{}
		go func(index int) {
			defer wg.Done()
			defer func() { <-sem }()
			if err := p.runScene(ctx, s, index); err != nil {
				errs <- fmt.Errorf("scene %d: %w", index, err)
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	return <-errs // nil when the channel is empty
}

// reviseDegraded is Roadmap C3's bounded re-plan rung: if any scene degraded to a
// fallback card, ask the planner (via the Reviser interface) to replace JUST those
// beats once, then re-run select -> assemble -> render for exactly those scenes.
// Bounded to a single revision per job — a prior BeatRevised in the history means
// this job already had its one shot, win or lose.
func (p *Pipeline) reviseDegraded(ctx context.Context, s *JobContext) error {
	reviser, ok := p.Planner.(Reviser)
	if !ok {
		return nil // this planner (e.g. StubPlanner alone) never revises
	}
	for _, h := range s.History {
		if h.Kind == "BeatRevised" {
			return nil // already used this job's one revision round
		}
	}

	var failed []FailedBeat
	var indexes []int
	for i, sc := range s.Scenes {
		if sc.Outcome.Degraded {
			failed = append(failed, FailedBeat{Beat: sc.Beat, Error: warningsForScene(s.Warnings, i)})
			indexes = append(indexes, i)
		}
	}
	if len(failed) == 0 {
		return nil
	}

	revised, err := reviser.Revise(ctx, ReviseView{Request: s.Request, Failed: failed})
	if err != nil {
		return fmt.Errorf("revise: %w", err)
	}
	if len(revised) != len(indexes) {
		return fmt.Errorf("revise: got %d beats, want %d", len(revised), len(indexes))
	}

	for k, i := range indexes {
		if err := p.Director.Apply(ctx, s, BeatRevised{Index: i, Beat: revised[k]}); err != nil {
			return err
		}
	}
	return p.rerunScenes(ctx, s, indexes)
}

// warningsForScene returns every warning recorded for scene i, joined, as short
// context for the reviser on why that beat failed. Warnings are formatted "scene %d
// ..." or "scene %d: ..."; matching on those exact prefixes (not a bare substring)
// avoids "scene 1" spuriously matching a warning about scene 10.
func warningsForScene(warnings []string, i int) string {
	prefix := fmt.Sprintf("scene %d ", i)
	prefixColon := fmt.Sprintf("scene %d:", i)
	var out []string
	for _, w := range warnings {
		if strings.HasPrefix(w, prefix) || strings.HasPrefix(w, prefixColon) {
			out = append(out, w)
		}
	}
	return strings.Join(out, "; ")
}

// rerunScenes re-drives select -> assemble -> render for exactly the given scene
// indexes (used after a C3 revision) — the same bounded fan-out as runScenes, just
// scoped to a subset instead of every scene.
func (p *Pipeline) rerunScenes(ctx context.Context, s *JobContext, indexes []int) error {
	concurrency := p.Concurrency
	if concurrency <= 0 {
		concurrency = 3
	}
	sem := make(chan struct{}, concurrency)
	errs := make(chan error, len(indexes))
	var wg sync.WaitGroup
	for _, i := range indexes {
		wg.Add(1)
		sem <- struct{}{}
		go func(index int) {
			defer wg.Done()
			defer func() { <-sem }()
			if err := p.runScene(ctx, s, index); err != nil {
				errs <- fmt.Errorf("scene %d: %w", index, err)
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	return <-errs
}

// runScene climbs the per-scene quality ladder:
//
//	(1) select -> policy check (forbid/mustShow) -> assemble
//	(2) on failure: ONE re-correct pass (errors fed back to the selector)
//	(3) on failure: the deterministic fallback card (always valid)
//
// Render errors retry once, then fall back to the card. Only an unrenderable card —
// i.e. the engine itself is broken — errors out.
func (p *Pipeline) runScene(ctx context.Context, s *JobContext, i int) error {
	digest, err := p.Engine.CatalogDigest(ctx, s.Scenes[i].Beat.DomainHint)
	if err != nil {
		return fmt.Errorf("catalog digest: %w", err)
	}

	var warnings []string
	outcome := SceneOutcome{Index: i, Source: SourceBuilder, Status: "ok", Rung: 1, Attempts: 1}
	var view SelectorView
	p.Director.Read(func() { view = SelectView(s, i, digest) })
	asm, ok := AssembleResult{}, false

	for attempt := 1; attempt <= 2 && !ok; attempt++ {
		outcome.Attempts = attempt
		placements, selErr := p.Selector.Select(ctx, view)
		if selErr != nil {
			warnings = append(warnings, fmt.Sprintf("scene %d select attempt %d: %v", i, attempt, selErr))
			break // selector tiers already exhausted internally -> card
		}
		if policyErrs := checkPolicies(s.Scenes[i].Beat, placements); len(policyErrs) > 0 {
			if attempt == 1 {
				view.Feedback = policyErrs
				outcome.Rung = 2
				continue // one re-correct on policy violations
			}
			warnings = append(warnings, fmt.Sprintf("scene %d: policy violations accepted with warning: %s", i, policyErrs[0].Message))
		}
		if err := p.Director.Apply(ctx, s, SceneSelected{Index: i, Placements: placements}); err != nil {
			return err
		}
		asm, err = p.assemble(ctx, s, i)
		if err != nil {
			return err // transport-level failure: the engine is unreachable
		}
		if asm.OK {
			ok = true
			break
		}
		view.Feedback = asm.Errors
		outcome.Rung = 2
		warnings = append(warnings, fmt.Sprintf("scene %d assemble attempt %d: %s", i, attempt, firstMsg(asm.Errors)))
	}

	if !ok {
		// Rung 3: the deterministic fallback card. Keeps the slot (same index, sane
		// duration) so offsets and the narration arc never shift.
		outcome = SceneOutcome{Index: i, Source: SourceFallback, Status: "fallback", Rung: 8, Attempts: outcome.Attempts, Degraded: true}
		if err := p.Director.Apply(ctx, s, SceneSelected{Index: i, Placements: fallbackCard(s.Scenes[i].Beat)}); err != nil {
			return err
		}
		asm, err = p.assemble(ctx, s, i)
		if err != nil {
			return err
		}
		if !asm.OK {
			return fmt.Errorf("fallback card failed to assemble: %s", firstMsg(asm.Errors))
		}
	}

	built := SceneBuilt{
		Index:    i,
		SpecHash: asm.SpecHash,
		SpecBlob: asm.Spec,
		Recap:    RecapEntry{SceneIndex: i, Takeaway: s.Scenes[i].Beat.Goal},
		Outcome:  outcome,
	}
	if err := p.Director.Apply(ctx, s, built); err != nil {
		return err
	}
	for _, w := range warnings {
		if err := p.Director.Apply(ctx, s, SceneFellBack{Index: i, Reason: w, Outcome: outcome}); err != nil {
			return err
		}
	}

	// Render, retrying once (transient) before giving up.
	rr, rerr := p.Engine.Render(ctx, RenderRequest{Spec: asm.Spec})
	if rerr != nil {
		rr, rerr = p.Engine.Render(ctx, RenderRequest{Spec: asm.Spec})
	}
	if rerr != nil {
		return fmt.Errorf("render: %w", rerr)
	}
	return p.Director.Apply(ctx, s, SceneRendered{
		Index:       i,
		Clip:        rr.Video,
		DurationSec: rr.DurationSec,
		Cached:      rr.Cached,
	})
}

// assemble ships the scene's current placements to the engine's deterministic assembler.
func (p *Pipeline) assemble(ctx context.Context, s *JobContext, i int) (AssembleResult, error) {
	var in AssemblerInput
	p.Director.Read(func() { in = AsmInput(s, i) })
	asm, err := p.Engine.Assemble(ctx, AssembleRequest{
		Placements: in.Placements,
		Beat:       in.Beat,
		Theme:      in.Theme,
		Palette:    in.Palette,
		Canvas:     in.Canvas,
		Seed:       in.Seed,
	})
	if err != nil {
		return AssembleResult{}, fmt.Errorf("assemble: %w", err)
	}
	return asm, nil
}

// appendEndCard closes multi-scene videos with a short branded card beat (the plan's
// outro as its narration). The items domain hint steers both selector tiers to the
// card builder; single-scene videos stay single.
func appendEndCard(plan LessonPlan) LessonPlan {
	if len(plan.Scenes) < 2 {
		return plan
	}
	outro := strings.TrimSpace(plan.NarrationArc.Outro)
	if outro == "" {
		outro = "Great job! See you next time."
	}
	index := len(plan.Scenes)
	goals := plan.Goals
	if len(goals) > 2 {
		goals = goals[:2]
	}
	plan.Scenes = append(plan.Scenes, SceneBeat{
		ID:                fmt.Sprintf("beat-%d", index+1),
		Index:             index,
		Title:             plan.Title,
		Goal:              "closing card: " + plan.Throughline,
		DomainHint:        DomainItems,
		KeyPoints:         goals,
		NarrationBeats:    []string{outro},
		DurationBudgetSec: 4,
	})
	return plan
}

// fallbackCard is the ladder's deterministic net: a text card from the beat, always valid.
func fallbackCard(beat SceneBeat) []BuilderPlacement {
	title := strings.TrimSpace(beat.Title)
	if title == "" {
		title = "Let's think about it"
	}
	lines := beat.KeyPoints
	if len(lines) == 0 {
		lines = beat.NarrationBeats
	}
	if len(lines) > 3 {
		lines = lines[:3]
	}
	return []BuilderPlacement{{
		Builder: "items.card",
		Params:  map[string]any{"title": title, "lines": lines},
		Animate: "fadeIn",
	}}
}

// checkPolicies enforces the beat's forbid/mustShow constraints on the selection.
func checkPolicies(beat SceneBeat, placements []BuilderPlacement) []ValidationError {
	blob, _ := json.Marshal(placements)
	text := strings.ToLower(string(blob))
	var errs []ValidationError
	for _, f := range beat.Forbid {
		if f = strings.ToLower(strings.TrimSpace(f)); f != "" && strings.Contains(text, f) {
			errs = append(errs, ValidationError{Path: "placements", Code: "FORBIDDEN", Message: fmt.Sprintf("placements use forbidden %q", f)})
		}
	}
	for _, m := range beat.MustShow {
		if m = strings.ToLower(strings.TrimSpace(m)); m != "" && !strings.Contains(text, m) {
			errs = append(errs, ValidationError{Path: "placements", Code: "MISSING", Message: fmt.Sprintf("placements must show %q", m)})
		}
	}
	return errs
}

func allDegraded(scenes []SceneState) bool {
	for _, sc := range scenes {
		if !sc.Outcome.Degraded {
			return false
		}
	}
	return true
}

// clipsOnlyAssembly summarizes the rendered clips when no stitcher is configured: the
// "final video" is the ordered clip list with cumulative offsets.
func clipsOnlyAssembly(s *JobContext) FinalAssembly {
	offsets := make([]float64, 0, len(s.Scenes))
	total := 0.0
	firstClip := ""
	for _, sc := range s.Scenes {
		offsets = append(offsets, total)
		if sc.Render != nil {
			total += sc.Render.DurationSec
			if firstClip == "" && sc.Render.Clip != nil {
				firstClip = sc.Render.Clip.Key
			}
		}
	}
	return FinalAssembly{VideoKey: firstClip, DurationSec: total, SceneOffsets: offsets}
}

func firstMsg(errs []ValidationError) string {
	if len(errs) == 0 {
		return ""
	}
	return errs[0].Message
}
