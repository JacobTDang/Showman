package orchestrator

import (
	"context"
	"fmt"
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
	if err := p.Director.Apply(ctx, s, PlanProduced{Plan: plan, Canvas: canvas}); err != nil {
		return err
	}

	// 2..4 per scene: select -> assemble -> render. Sequential v1 (bounded fan-out later);
	// per-scene render caching lives engine-side, so retries and re-runs stay cheap.
	for i := range s.Scenes {
		if err := p.runScene(ctx, s, i); err != nil {
			return fmt.Errorf("scene %d: %w", i, err)
		}
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

func (p *Pipeline) runScene(ctx context.Context, s *JobContext, i int) error {
	// Select builders for the beat.
	digest, err := p.Engine.CatalogDigest(ctx, s.Scenes[i].Beat.DomainHint)
	if err != nil {
		return fmt.Errorf("catalog digest: %w", err)
	}
	placements, err := p.Selector.Select(ctx, SelectView(s, i, digest))
	if err != nil {
		return fmt.Errorf("select: %w", err)
	}
	if err := p.Director.Apply(ctx, s, SceneSelected{Index: i, Placements: placements}); err != nil {
		return err
	}

	// Assemble one validated spec (engine-side, deterministic).
	in := AsmInput(s, i)
	asm, err := p.Engine.Assemble(ctx, AssembleRequest{
		Placements: in.Placements,
		Beat:       in.Beat,
		Theme:      in.Theme,
		Palette:    in.Palette,
		Canvas:     in.Canvas,
		Seed:       in.Seed,
	})
	if err != nil {
		return fmt.Errorf("assemble: %w", err)
	}
	if !asm.OK {
		return fmt.Errorf("assemble: %d validation errors (first: %s)", len(asm.Errors), firstMsg(asm.Errors))
	}
	built := SceneBuilt{
		Index:    i,
		SpecHash: asm.SpecHash,
		SpecBlob: asm.Spec,
		Recap:    RecapEntry{SceneIndex: i, Takeaway: s.Scenes[i].Beat.Goal},
		Outcome:  SceneOutcome{Index: i, Source: SourceBuilder, Status: "ok", Rung: 1, Attempts: 1},
	}
	if err := p.Director.Apply(ctx, s, built); err != nil {
		return err
	}

	// Render the clip (engine-side cache makes unchanged specs free).
	rr, err := p.Engine.Render(ctx, RenderRequest{Spec: asm.Spec})
	if err != nil {
		return fmt.Errorf("render: %w", err)
	}
	return p.Director.Apply(ctx, s, SceneRendered{
		Index:       i,
		Clip:        rr.Video,
		DurationSec: rr.DurationSec,
		Cached:      rr.Cached,
	})
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
