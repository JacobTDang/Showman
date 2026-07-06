package orchestrator

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/cloudwego/eino/compose"
)

// PhaseAwaitingReview is a JobView-only status (not a store JobPhase / Director delta):
// the job is paused at the HITL preview gate. It is derived from JobContext.Resume,
// never written by a delta, so it can't drift from the single-writer discipline.
const PhaseAwaitingReview JobPhase = "awaiting-review"

// JobView is the external projection of a JobContext — what GET /v1/jobs/:id returns.
// It never exposes internals (placements, spec blobs, history).
type JobView struct {
	JobID     string         `json:"jobId"`
	Status    JobPhase       `json:"status"`
	ResumeURL string         `json:"resumeUrl,omitempty"` // set iff Status == awaiting-review
	Scenes    []SceneView    `json:"scenes,omitempty"`
	Result    *FinalAssembly `json:"result,omitempty"`
	Scorecard *Scorecard     `json:"scorecard,omitempty"`
	Warnings  []string       `json:"warnings,omitempty"`
	Error     *JobError      `json:"error,omitempty"`
	CreatedAt string         `json:"createdAt"`
	UpdatedAt string         `json:"updatedAt"`
}

// SceneView is the per-scene slice of the projection.
type SceneView struct {
	Index       int     `json:"index"`
	Title       string  `json:"title,omitempty"`
	Status      string  `json:"status"`
	DurationSec float64 `json:"durationSec,omitempty"`
	Cached      bool    `json:"cached,omitempty"`
}

// ProjectJob builds the external view from the store.
func ProjectJob(s *JobContext) JobView {
	view := JobView{
		JobID:     s.JobID,
		Status:    s.Phase,
		Warnings:  s.Warnings,
		Error:     s.Error,
		CreatedAt: s.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt: s.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
	if s.Phase == PhaseDone {
		view.Result = s.Final
		card := ComputeScorecard(s)
		view.Scorecard = &card
	}
	if s.Resume != nil && s.Resume.ResumedAt == nil {
		view.Status = PhaseAwaitingReview
		view.ResumeURL = "/v1/jobs/" + s.JobID + "/resume"
	}
	for _, sc := range s.Scenes {
		sv := SceneView{Index: sc.Index, Title: sc.Beat.Title, Status: "queued"}
		if len(sc.Placements) > 0 {
			sv.Status = "selected"
		}
		if sc.SpecHash != "" {
			sv.Status = "assembled"
		}
		if sc.Render != nil {
			sv.Status = string(sc.Render.Status)
			sv.DurationSec = sc.Render.DurationSec
			sv.Cached = sc.Render.Cached
		}
		view.Scenes = append(view.Scenes, sv)
	}
	return view
}

// Server exposes the orchestrator's async job API:
//
//	POST /v1/generate         { topic, query, options? } -> 202 { jobId, statusUrl }
//	GET  /v1/jobs/:id         -> JobView (status "awaiting-review" + resumeUrl at the gate)
//	POST /v1/jobs/:id/resume  -> continue a gated job past its preview checkpoint
//	GET  /healthz             -> { ok: true }
//
// Jobs run in a background goroutine through the Eino graph (B2/B3); polls read the
// last checkpoint, so the reader never races the (single-writer) pipeline.
type Server struct {
	Pipeline   *Pipeline
	Graph      *GenerateGraph
	Checkpoint CheckpointStore
}

// Handler builds the HTTP handler.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /v1/generate", s.handleGenerate)
	mux.HandleFunc("GET /v1/jobs/{id}", s.handleJob)
	mux.HandleFunc("POST /v1/jobs/{id}/resume", s.handleResume)
	return mux
}

func (s *Server) handleGenerate(w http.ResponseWriter, r *http.Request) {
	var req ExternalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}
	if strings.TrimSpace(req.Topic) == "" && strings.TrimSpace(req.Query) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_input", "message": "provide a non-empty topic and/or query"})
		return
	}

	jobID, err := newJobID()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal"})
		return
	}

	// Seed the store BEFORE returning 202 so an immediate poll finds the job.
	initial, err := NewJobContext(jobID, req, s.Pipeline.Director.clock.Now())
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	if err := s.Checkpoint.Save(r.Context(), initial); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "checkpoint_failed"})
		return
	}

	// Detach from the request context: the job outlives the HTTP call.
	go s.runViaGraph(jobID, req)

	writeJSON(w, http.StatusAccepted, map[string]string{
		"jobId":     jobID,
		"status":    string(PhaseQueued),
		"statusUrl": "/v1/jobs/" + jobID,
	})
}

// runViaGraph drives one job through the Eino graph and reconciles the three possible
// outcomes with the durable checkpoint store (which the graph's own Director.Apply
// calls already keep current through the end of the scenes node):
//
//   - success: the graph's own JobFinalized delta already recorded everything.
//   - interrupt (HITL gate): stamp a ResumeState onto the last-persisted job so a
//     poller sees "awaiting-review" and a future POST .../resume can continue it.
//   - error: the graph doesn't run through Director.Apply on a hard failure (there is
//     no live *JobContext in scope at the error site), so reconstruct a JobFailed
//     delta from whatever was last persisted.
func (s *Server) runViaGraph(jobID string, req ExternalRequest) {
	ctx := context.Background()
	_, interrupted, err := s.Graph.Run(ctx, GraphInput{JobID: jobID, Request: req})

	if interrupted != nil {
		token, ok := rootCauseID(interrupted)
		if !ok {
			return // defensive: no root cause found, nothing sane to persist
		}
		loaded, loadErr := s.Checkpoint.Load(ctx, jobID)
		if loadErr != nil {
			return
		}
		loaded.Resume = &ResumeState{Token: token, At: time.Now()}
		_ = s.Checkpoint.Save(ctx, loaded)
		return
	}

	if err != nil {
		loaded, loadErr := s.Checkpoint.Load(ctx, jobID)
		if loadErr != nil {
			return
		}
		_ = s.Pipeline.Director.Apply(ctx, loaded, JobFailed{Err: JobError{Node: "graph", Message: err.Error(), Retryable: false}})
		s.Pipeline.deliverWebhook(ctx, loaded)
	}
}

// rootCauseID finds the resumable interrupt's id — the one InterruptCtx flagged as
// the root cause (falls back to the first entry if none is flagged, defensively).
func rootCauseID(info *compose.InterruptInfo) (string, bool) {
	for _, c := range info.InterruptContexts {
		if c.IsRootCause {
			return c.ID, true
		}
	}
	if len(info.InterruptContexts) > 0 {
		return info.InterruptContexts[0].ID, true
	}
	return "", false
}

func (s *Server) handleJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	stored, err := s.Checkpoint.Load(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "jobId": id})
		return
	}
	writeJSON(w, http.StatusOK, ProjectJob(stored))
}

// handleResume continues a job paused at the HITL preview gate. 409 if the job was
// never gated; idempotent (200, current view, no re-trigger) if already resumed.
func (s *Server) handleResume(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx := r.Context()
	stored, err := s.Checkpoint.Load(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "jobId": id})
		return
	}
	if stored.Resume == nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "not_awaiting_review", "jobId": id})
		return
	}
	if stored.Resume.ResumedAt != nil {
		// Idempotent: already triggered, just report current status.
		writeJSON(w, http.StatusOK, ProjectJob(stored))
		return
	}

	now := time.Now()
	stored.Resume.ResumedAt = &now
	if err := s.Checkpoint.Save(ctx, stored); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "checkpoint_failed"})
		return
	}

	go s.reconcileResume(id, stored.Resume.Token)

	writeJSON(w, http.StatusAccepted, map[string]string{"jobId": id, "status": "resuming", "statusUrl": "/v1/jobs/" + id})
}

// Listen starts the server on addr (":8090"); returns the bound address.
func (s *Server) Listen(addr string) (net.Listener, *http.Server, error) {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, nil, err
	}
	srv := &http.Server{Handler: s.Handler()}
	go func() { _ = srv.Serve(ln) }()
	return ln, srv, nil
}

func newJobID() (string, error) {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return "gen_" + hex.EncodeToString(b[:]), nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// Headers are gone; nothing more to do than note it.
		fmt.Println("writeJSON:", err)
	}
}
