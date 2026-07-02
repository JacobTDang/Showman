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
)

// JobView is the external projection of a JobContext — what GET /v1/jobs/:id returns.
// It never exposes internals (placements, spec blobs, history).
type JobView struct {
	JobID     string         `json:"jobId"`
	Status    JobPhase       `json:"status"`
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
//	POST /v1/generate  { topic, query, options? } -> 202 { jobId, statusUrl }
//	GET  /v1/jobs/:id  -> JobView
//	GET  /healthz      -> { ok: true }
//
// Jobs run in a background goroutine; polls read the last checkpoint, so the reader
// never races the (single-writer) pipeline.
type Server struct {
	Pipeline   *Pipeline
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
	go func() {
		_, _ = s.Pipeline.Run(context.Background(), jobID, req)
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{
		"jobId":     jobID,
		"status":    string(PhaseQueued),
		"statusUrl": "/v1/jobs/" + jobID,
	})
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
