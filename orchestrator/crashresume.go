package orchestrator

import (
	"context"
	"fmt"
)

// JobLister is implemented by checkpoint stores that can enumerate their jobs
// (FileCheckpointStore; InMemoryCheckpointStore deliberately does not — an in-memory
// store loses everything on process exit, so there is nothing to resume after a
// restart, and skipping the scan there is correct, not an oversight).
type JobLister interface {
	ListJobIDs() ([]string, error)
}

// ResumeIncompleteJobs scans the checkpoint store on boot (B4: crash-resume) and
// re-drives every job that was neither finished nor legitimately paused when the
// process last exited:
//
//   - Done / Error: terminal, left alone.
//   - Awaiting review (Resume set, ResumedAt nil): a human hasn't approved yet —
//     left alone; still reachable via the normal POST .../resume endpoint.
//   - Resume triggered but not finished (Resume set, ResumedAt set, not Done): the
//     process died mid-resume; re-drive via Graph.Resume with the same token.
//   - Everything else (in-flight through plan/scenes/stitch): re-drive from the top
//     via Graph.Run. Re-running "plan" costs a re-plan (and, on the LLM tier, a
//     fresh LLM call), but the engine's own render cache makes the expensive part
//     of "scenes" cheap to redo — favoring "always eventually finishes" over
//     "never repeats any work."
//
// Returns how many jobs it kicked off, for a boot-log line. Only meaningful with a
// store that implements JobLister; otherwise it's a no-op (nothing to scan).
func (s *Server) ResumeIncompleteJobs(ctx context.Context) (int, error) {
	lister, ok := s.Checkpoint.(JobLister)
	if !ok {
		return 0, nil
	}
	ids, err := lister.ListJobIDs()
	if err != nil {
		return 0, fmt.Errorf("crash-resume: list jobs: %w", err)
	}

	resumed := 0
	for _, id := range ids {
		stored, err := s.Checkpoint.Load(ctx, id)
		if err != nil {
			continue // corrupt/unreadable checkpoint: skip rather than fail the whole boot
		}
		if stored.Phase == PhaseDone || stored.Phase == PhaseError {
			continue
		}
		if stored.Resume != nil && stored.Resume.ResumedAt == nil {
			continue // legitimately awaiting human review
		}

		resumed++
		if stored.Resume != nil && stored.Resume.ResumedAt != nil {
			token := stored.Resume.Token
			go s.reconcileResume(id, token)
		} else {
			req := stored.Request
			go s.runViaGraph(id, req)
		}
	}
	return resumed, nil
}

// reconcileResume mirrors runViaGraph's error handling for the resume path (used by
// both POST .../resume and crash-resume boot scan).
func (s *Server) reconcileResume(jobID, token string) {
	bg := context.Background()
	if _, err := s.Graph.Resume(bg, jobID, token); err != nil {
		if loaded, loadErr := s.Checkpoint.Load(bg, jobID); loadErr == nil {
			_ = s.Pipeline.Director.Apply(bg, loaded, JobFailed{Err: JobError{Node: "graph-resume", Message: err.Error()}})
		}
	}
}
