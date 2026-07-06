package orchestrator

import (
	"context"
	"fmt"
	"sync"

	"github.com/cloudwego/eino/compose"
)

// The Eino graph runner (Graph Perfection P5): the same pipeline — plan -> scenes ->
// stitch — expressed as a compose.Graph, which buys interrupt/resume semantics on top
// of the Director's typed-delta store:
//
//   - Every node reuses the Pipeline's existing functions verbatim; the JobContext
//     flows through the graph as the payload, and all writes still go through
//     Director.Apply (audited, checkpointed, single-writer).
//   - HITL preview gate: with options.previewGate, the run INTERRUPTS after all scenes
//     are assembled + rendered and before the final stitch. The caller inspects the
//     scene clips / scorecard, then resumes. Eino checkpoints the run; resume works
//     across process restarts when the byte store is persistent.
//
// The gate sits after render (not after assembly) deliberately: clips are the thing a
// reviewer can actually watch, and engine render caching makes the pre-gate work
// re-usable either way.

// GraphInput seeds one generate run.
type GraphInput struct {
	JobID   string          `json:"jobId"`
	Request ExternalRequest `json:"request"`
}

// GenerateGraph is the compiled Eino graph for the generate pipeline.
type GenerateGraph struct {
	runnable compose.Runnable[GraphInput, *JobContext]
}

// EinoByteStore is an in-memory compose.CheckPointStore (opaque bytes by id). Swap for
// a file/object-backed implementation to survive process restarts.
type EinoByteStore struct {
	mu sync.RWMutex
	m  map[string][]byte
}

// NewEinoByteStore builds an empty store.
func NewEinoByteStore() *EinoByteStore { return &EinoByteStore{m: map[string][]byte{}} }

// Get returns the checkpoint bytes for id.
func (s *EinoByteStore) Get(_ context.Context, id string) ([]byte, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.m[id]
	return b, ok, nil
}

// Set stores the checkpoint bytes for id.
func (s *EinoByteStore) Set(_ context.Context, id string, cp []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[id] = cp
	return nil
}

func init() {
	// Checkpoint payloads carry our types; register them with eino's serializer once.
	_ = compose.RegisterSerializableType[*JobContext]("showman.JobContext")
	_ = compose.RegisterSerializableType[GraphInput]("showman.GraphInput")
	_ = compose.RegisterSerializableType[JobView]("showman.JobView")
}

// BuildGenerateGraph compiles the pipeline as an Eino graph over the given checkpoint
// byte store.
func BuildGenerateGraph(ctx context.Context, p *Pipeline, store compose.CheckPointStore) (*GenerateGraph, error) {
	g := compose.NewGraph[GraphInput, *JobContext]()

	plan := compose.InvokableLambda(func(ctx context.Context, in GraphInput) (*JobContext, error) {
		s, err := NewJobContext(in.JobID, in.Request, p.Director.clock.Now())
		if err != nil {
			return nil, err
		}
		canvas := p.Canvas
		if canvas.Width == 0 || canvas.Height == 0 || canvas.FPS == 0 {
			canvas = DefaultCanvas
		}
		if err := p.Director.Apply(ctx, s, PhaseAdvanced{Phase: PhasePlanning}); err != nil {
			return nil, err
		}
		lessonPlan, err := p.Planner.Plan(ctx, PlanView(s))
		if err != nil {
			return nil, fmt.Errorf("plan: %w", err)
		}
		if len(lessonPlan.Scenes) == 0 {
			return nil, fmt.Errorf("plan: produced zero scenes")
		}
		lessonPlan = appendEndCard(lessonPlan)
		if err := p.Director.Apply(ctx, s, PlanProduced{Plan: lessonPlan, Canvas: canvas}); err != nil {
			return nil, err
		}
		return s, nil
	})

	scenes := compose.InvokableLambda(func(ctx context.Context, s *JobContext) (*JobContext, error) {
		if err := p.runScenes(ctx, s); err != nil {
			return nil, err
		}
		if len(s.Scenes) > 0 && allDegraded(s.Scenes) {
			return nil, fmt.Errorf("all %d scenes degraded to fallback cards", len(s.Scenes))
		}
		return s, nil
	})

	stitch := compose.InvokableLambda(func(ctx context.Context, s *JobContext) (*JobContext, error) {
		// HITL preview gate: interrupt once; on resume the node reruns with a nil
		// input and the store comes back via the saved interrupt state.
		wasInterrupted, hasState, saved := compose.GetInterruptState[*JobContext](ctx)
		if wasInterrupted {
			if hasState && saved != nil {
				// Reload from the durable checkpoint store rather than trusting
				// Eino's own serialized snapshot: the HTTP layer stamps
				// Resume.ResumedAt onto that SAME store between the interrupt
				// firing and the resume being triggered, and this node's finalize
				// write must not clobber that with a stale copy.
				s = saved
				if p.Director.checkpoint != nil {
					if fresh, err := p.Director.checkpoint.Load(ctx, saved.JobID); err == nil && fresh != nil {
						s = fresh
					}
				}
			}
		} else if s != nil && s.Request.Options.PreviewGate {
			return nil, compose.StatefulInterrupt(ctx, ProjectJob(s), s)
		}
		if s == nil {
			return nil, fmt.Errorf("stitch: no job state available")
		}
		if p.Stitcher != nil {
			if err := p.Director.Apply(ctx, s, PhaseAdvanced{Phase: PhaseStitching}); err != nil {
				return nil, err
			}
			final, err := p.Stitcher.Stitch(ctx, s)
			if err != nil {
				return nil, fmt.Errorf("stitch: %w", err)
			}
			if err := p.Director.Apply(ctx, s, JobFinalized{Final: final}); err != nil {
				return nil, err
			}
			return s, nil
		}
		if err := p.Director.Apply(ctx, s, JobFinalized{Final: clipsOnlyAssembly(s)}); err != nil {
			return nil, err
		}
		return s, nil
	})

	if err := g.AddLambdaNode("plan", plan); err != nil {
		return nil, err
	}
	if err := g.AddLambdaNode("scenes", scenes); err != nil {
		return nil, err
	}
	if err := g.AddLambdaNode("stitch", stitch); err != nil {
		return nil, err
	}
	for _, edge := range [][2]string{{compose.START, "plan"}, {"plan", "scenes"}, {"scenes", "stitch"}, {"stitch", compose.END}} {
		if err := g.AddEdge(edge[0], edge[1]); err != nil {
			return nil, err
		}
	}

	runnable, err := g.Compile(ctx, compose.WithGraphName("showman-generate"), compose.WithCheckPointStore(store))
	if err != nil {
		return nil, err
	}
	return &GenerateGraph{runnable: runnable}, nil
}

// Run executes one generate job. On a preview-gate interrupt it returns the interrupt
// info (with the job's view attached) and a nil store; call Resume to continue.
func (gg *GenerateGraph) Run(ctx context.Context, in GraphInput) (*JobContext, *compose.InterruptInfo, error) {
	s, err := gg.runnable.Invoke(ctx, in, compose.WithCheckPointID(in.JobID))
	if err != nil {
		if info, ok := compose.ExtractInterruptInfo(err); ok {
			return nil, info, nil
		}
		return nil, nil, err
	}
	return s, nil, nil
}

// Resume continues an interrupted run from its checkpoint. interruptID comes from the
// interrupt info's InterruptContexts (the root cause's ID).
func (gg *GenerateGraph) Resume(ctx context.Context, jobID, interruptID string) (*JobContext, error) {
	ctx = compose.Resume(ctx, interruptID)
	return gg.runnable.Invoke(ctx, GraphInput{JobID: jobID}, compose.WithCheckPointID(jobID))
}
