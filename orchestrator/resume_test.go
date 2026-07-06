package orchestrator

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newGatedTestServer() (*Server, *httptest.Server) {
	s, ts := newTestServer()
	return s, ts
}

func waitForStatus(t *testing.T, ts *httptest.Server, statusURL string, want JobPhase, deadline time.Duration) JobView {
	t.Helper()
	var view JobView
	end := time.Now().Add(deadline)
	for {
		r, err := ts.Client().Get(ts.URL + statusURL)
		if err != nil {
			t.Fatal(err)
		}
		_ = json.NewDecoder(r.Body).Decode(&view)
		_ = r.Body.Close()
		if view.Status == want {
			return view
		}
		if time.Now().After(end) {
			t.Fatalf("never reached status %q; last view: %+v", want, view)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestGatedJobReachesAwaitingReviewThenResumes(t *testing.T) {
	_, ts := newGatedTestServer()
	defer ts.Close()

	res, err := ts.Client().Post(ts.URL+"/v1/generate", "application/json",
		strings.NewReader(`{"topic":"fractions","query":"show 3/4 as a pie","options":{"previewGate":true}}`))
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 202 {
		t.Fatalf("want 202, got %d", res.StatusCode)
	}
	var accepted struct {
		JobID     string `json:"jobId"`
		StatusURL string `json:"statusUrl"`
	}
	_ = json.NewDecoder(res.Body).Decode(&accepted)

	view := waitForStatus(t, ts, accepted.StatusURL, PhaseAwaitingReview, 10*time.Second)
	if view.ResumeURL == "" {
		t.Fatalf("awaiting-review view must carry a resumeUrl: %+v", view)
	}
	if view.Result != nil {
		t.Fatalf("must not be finalized yet: %+v", view.Result)
	}
	// The gate fires after scenes are rendered — the view should show them.
	for _, sc := range view.Scenes {
		if sc.Status != string(RenderDone) && sc.Status != string(RenderCached) {
			t.Fatalf("scene %d should be rendered before the gate: %+v", sc.Index, sc)
		}
	}

	// Resume: 202, then the job completes.
	resumeRes, err := ts.Client().Post(ts.URL+view.ResumeURL, "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	if resumeRes.StatusCode != 202 {
		t.Fatalf("want 202 from resume, got %d", resumeRes.StatusCode)
	}

	done := waitForStatus(t, ts, accepted.StatusURL, PhaseDone, 10*time.Second)
	if done.Result == nil {
		t.Fatalf("resumed job should finalize: %+v", done)
	}
}

func TestResumeIsIdempotentAndRejectsUngatedJobs(t *testing.T) {
	_, ts := newGatedTestServer()
	defer ts.Close()

	// A job that never gated: resume must 409.
	res, _ := ts.Client().Post(ts.URL+"/v1/generate", "application/json", strings.NewReader(`{"topic":"counting","query":"count to 3"}`))
	var accepted struct {
		JobID string `json:"jobId"`
	}
	_ = json.NewDecoder(res.Body).Decode(&accepted)
	waitForStatus(t, ts, "/v1/jobs/"+accepted.JobID, PhaseDone, 10*time.Second)

	notGated, err := ts.Client().Post(ts.URL+"/v1/jobs/"+accepted.JobID+"/resume", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	if notGated.StatusCode != 409 {
		t.Fatalf("want 409 for a never-gated job, got %d", notGated.StatusCode)
	}

	// Unknown job: 404.
	unknown, _ := ts.Client().Post(ts.URL+"/v1/jobs/gen_doesnotexist/resume", "application/json", strings.NewReader("{}"))
	if unknown.StatusCode != 404 {
		t.Fatalf("want 404 for an unknown job, got %d", unknown.StatusCode)
	}

	// A gated job: first resume 202s, second is an idempotent 200 (no re-trigger).
	res2, _ := ts.Client().Post(ts.URL+"/v1/generate", "application/json",
		strings.NewReader(`{"topic":"fractions","query":"show 1/2","options":{"previewGate":true}}`))
	var accepted2 struct {
		JobID     string `json:"jobId"`
		StatusURL string `json:"statusUrl"`
	}
	_ = json.NewDecoder(res2.Body).Decode(&accepted2)
	gated := waitForStatus(t, ts, accepted2.StatusURL, PhaseAwaitingReview, 10*time.Second)

	first, _ := ts.Client().Post(ts.URL+gated.ResumeURL, "application/json", strings.NewReader("{}"))
	if first.StatusCode != 202 {
		t.Fatalf("first resume should 202, got %d", first.StatusCode)
	}
	second, _ := ts.Client().Post(ts.URL+gated.ResumeURL, "application/json", strings.NewReader("{}"))
	if second.StatusCode != 200 {
		t.Fatalf("second resume should be an idempotent 200, got %d", second.StatusCode)
	}
	waitForStatus(t, ts, accepted2.StatusURL, PhaseDone, 10*time.Second)
}

// TestV1CheckpointDecodesForward proves the B2 schema addition (Resume) is purely
// additive: a checkpoint written before this field existed (schemaVersion 1, no
// "resume" key at all) must decode into today's JobContext with Resume == nil —
// i.e. never mistaken for "awaiting review" — with no migration code required.
func TestV1CheckpointDecodesForward(t *testing.T) {
	v1JSON := `{
		"jobId": "gen_old",
		"request": {"topic": "x", "query": "y", "options": {}},
		"requestHash": "abc",
		"rootSeed": 1,
		"schemaVersion": 1,
		"createdAt": "2026-01-01T00:00:00Z",
		"updatedAt": "2026-01-01T00:00:00Z",
		"phase": "done",
		"continuity": {"theme": "", "palette": {"bg":"","fg":"","accent":"","muted":""}, "canvas": {"width":0,"height":0,"fps":0}, "recap": []},
		"budget": {"totalTargetSec":0,"hardMaxSec":0,"reservedSec":0,"scenes":null},
		"scenes": [],
		"history": []
	}`
	var s JobContext
	if err := json.Unmarshal([]byte(v1JSON), &s); err != nil {
		t.Fatalf("v1 checkpoint must decode into the current struct: %v", err)
	}
	if s.Resume != nil {
		t.Fatalf("a v1 checkpoint must never look like it's awaiting review: %+v", s.Resume)
	}
	view := ProjectJob(&s)
	if view.Status == PhaseAwaitingReview {
		t.Fatalf("a v1-decoded job must not project as awaiting-review")
	}
}
