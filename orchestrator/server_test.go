package orchestrator

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newTestServer() (*Server, *httptest.Server) {
	engine := &pipelineEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	cp := NewInMemoryCheckpointStore()
	p := &Pipeline{
		Director: NewDirector(cp, nil),
		Planner:  StubPlanner{},
		Selector: NewKeywordSelector(engine),
		Engine:   engine,
		// No stitcher: the job completes at rendered clips (no ffmpeg needed in this test).
	}
	graph, err := BuildGenerateGraph(context.Background(), p, NewEinoByteStore())
	if err != nil {
		panic(err)
	}
	s := &Server{Pipeline: p, Graph: graph, Checkpoint: cp}
	return s, httptest.NewServer(s.Handler())
}

func TestGenerateJobLifecycle(t *testing.T) {
	_, ts := newTestServer()
	defer ts.Close()

	// Submit.
	res, err := ts.Client().Post(ts.URL+"/v1/generate", "application/json",
		strings.NewReader(`{"topic":"fractions","query":"show the fraction 3/4 as a pie"}`))
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
	if accepted.JobID == "" || accepted.StatusURL != "/v1/jobs/"+accepted.JobID {
		t.Fatalf("bad 202 payload: %+v", accepted)
	}

	// Poll until done (the offline pipeline is fast; bound the wait anyway).
	var view JobView
	deadline := time.Now().Add(10 * time.Second)
	for {
		r, err := ts.Client().Get(ts.URL + accepted.StatusURL)
		if err != nil {
			t.Fatal(err)
		}
		if r.StatusCode != 200 {
			t.Fatalf("poll status %d", r.StatusCode)
		}
		_ = json.NewDecoder(r.Body).Decode(&view)
		_ = r.Body.Close()
		if view.Status == PhaseDone || view.Status == PhaseError {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("job did not finish; last view: %+v", view)
		}
		time.Sleep(20 * time.Millisecond)
	}

	if view.Status != PhaseDone {
		t.Fatalf("want done, got %q (%+v)", view.Status, view.Error)
	}
	if len(view.Scenes) != 4 {
		t.Fatalf("want 4 scenes (incl. endcard) in the view, got %d", len(view.Scenes))
	}
	for _, sc := range view.Scenes {
		if sc.Status != string(RenderDone) && sc.Status != string(RenderCached) {
			t.Fatalf("scene %d not rendered: %+v", sc.Index, sc)
		}
	}
	if view.Result == nil || len(view.Result.SceneOffsets) != 4 || view.Result.DurationSec != 24 {
		t.Fatalf("result missing/wrong: %+v", view.Result)
	}
}

func TestGenerateRejectsEmptyInputAndUnknownJob(t *testing.T) {
	_, ts := newTestServer()
	defer ts.Close()

	res, _ := ts.Client().Post(ts.URL+"/v1/generate", "application/json", strings.NewReader(`{"topic":"  ","query":""}`))
	if res.StatusCode != 400 {
		t.Fatalf("want 400 for empty input, got %d", res.StatusCode)
	}

	r, _ := ts.Client().Get(ts.URL + "/v1/jobs/gen_doesnotexist")
	if r.StatusCode != 404 {
		t.Fatalf("want 404 for unknown job, got %d", r.StatusCode)
	}
}

func TestProjectJobHidesInternals(t *testing.T) {
	s := &JobContext{
		JobID: "j", Phase: PhaseRendering,
		Scenes: []SceneState{{Index: 0, Beat: SceneBeat{Title: "T"}, Placements: []BuilderPlacement{{Builder: "x"}}, SpecHash: "h"}},
	}
	b, _ := json.Marshal(ProjectJob(s))
	out := string(b)
	if strings.Contains(out, "placements") || strings.Contains(out, "specHash") || strings.Contains(out, "history") {
		t.Fatalf("projection leaks internals: %s", out)
	}
	if !strings.Contains(out, `"status":"assembled"`) {
		t.Fatalf("scene status not projected: %s", out)
	}
}
