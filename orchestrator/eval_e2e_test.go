//go:build e2e

package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestOfflineE2EEval is Roadmap D1: the smoke-eval of the WHOLE binary surface,
// without Docker. It boots the real TS engine (`node --import tsx/esm worker.ts`,
// the production entrypoint — see test/integration/e2eWorker.test.ts for the TS-side
// equivalent) and drives the orchestrator's own HTTP surface (offline tiers: no
// OPENROUTER_API_KEY, so StubPlanner + KeywordSelector) over a 6-topic suite,
// asserting per-job scorecards. Gated behind the "e2e" build tag — go test ./...
// skips it; CI runs it as an explicit extra step.
func TestOfflineE2EEval(t *testing.T) {
	repoRoot := findRepoRoot(t)
	dataDir := t.TempDir()
	outDir := t.TempDir()

	enginePort := startEngine(t, repoRoot, dataDir)
	engine := NewHTTPEngineClient(fmt.Sprintf("http://127.0.0.1:%d", enginePort), 2*time.Minute)

	checkpoint := NewInMemoryCheckpointStore()
	pipeline := &Pipeline{
		Director: NewDirector(checkpoint, nil),
		Planner:  StubPlanner{},
		Selector: NewKeywordSelector(engine),
		Engine:   engine,
		Stitcher: &FFmpegStitcher{Fetcher: engine, OutDir: outDir},
	}
	graph, err := BuildGenerateGraph(context.Background(), pipeline, NewEinoByteStore())
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{Pipeline: pipeline, Graph: graph, Checkpoint: checkpoint}
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	// Topics are chosen so every scene beat's winning tool has no required-and-
	// undefaulted param the offline (regex-based) extractor can't fill — the same
	// bar the LIVE eval (D2) holds LLM-selected params to, just proven without a
	// key. Topics whose likely winner needs structured params no regex can build
	// (e.g. physics.circuit's element list, chem.molecule's name enum, chart.bar's
	// series arrays) are deliberately NOT smoke-tested here; that's a selector
	// capability gap (see PR description), not something this eval should paper
	// over by picking easy words.
	topics := []struct {
		topic string
		query string
	}{
		{"counting", "count to five with stars"},
		{"fractions", "show the fraction 3/4 as a pie"},
		{"graphing", "graph the line y = 2x + 1 on a coordinate plane"},
		{"decimals", "introduce decimals with tenths"},
		{"pendulum", "a pendulum swinging back and forth"},
		{"energy levels", "an atom's energy levels with a photon transition"},
	}

	type jobResult struct {
		Topic       string    `json:"topic"`
		Query       string    `json:"query"`
		JobID       string    `json:"jobId"`
		Scorecard   Scorecard `json:"scorecard"`
		DurationSec float64   `json:"durationSec"`
		Passed      bool      `json:"passed"`
		Failures    []string  `json:"failures,omitempty"`
	}
	results := make([]jobResult, 0, len(topics))

	for _, tc := range topics {
		body, _ := json.Marshal(map[string]string{"topic": tc.topic, "query": tc.query})
		res, err := ts.Client().Post(ts.URL+"/v1/generate", "application/json", strings.NewReader(string(body)))
		if err != nil {
			t.Fatalf("%s: generate: %v", tc.topic, err)
		}
		var accepted struct {
			JobID string `json:"jobId"`
		}
		_ = json.NewDecoder(res.Body).Decode(&accepted)
		_ = res.Body.Close()

		view := pollJobDone(t, ts, accepted.JobID, 90*time.Second)
		jr := jobResult{Topic: tc.topic, Query: tc.query, JobID: accepted.JobID}
		if view.Scorecard != nil {
			jr.Scorecard = *view.Scorecard
		}
		if view.Result != nil {
			jr.DurationSec = view.Result.DurationSec
		}
		jr.Failures = evalJobView(view)
		jr.Passed = len(jr.Failures) == 0
		results = append(results, jr)
	}

	artifactPath := filepath.Join(repoRoot, "orchestrator", "eval-scorecards.json")
	if data, err := json.MarshalIndent(results, "", "  "); err == nil {
		_ = os.WriteFile(artifactPath, data, 0o644)
	}

	for _, r := range results {
		for _, f := range r.Failures {
			t.Errorf("%s (%q): %s", r.Topic, r.Query, f)
		}
	}
}

// evalJobView checks the D1 acceptance bar against one completed job's view.
func evalJobView(view JobView) []string {
	var failures []string
	if view.Status != PhaseDone {
		return []string{fmt.Sprintf("job did not finish: status=%s error=%+v", view.Status, view.Error)}
	}
	sc := view.Scorecard
	if sc == nil || sc.Scenes == 0 {
		return []string{"no scorecard / zero scenes"}
	}
	if maxFallback := 1.0 / float64(sc.Scenes); sc.SourceDist.Fallback > maxFallback+1e-9 {
		failures = append(failures, fmt.Sprintf("fallback rate %.3f exceeds 1/%d", sc.SourceDist.Fallback, sc.Scenes))
	}
	if sc.DegradedRate != 0 {
		failures = append(failures, fmt.Sprintf("degradedRate %.3f, want 0", sc.DegradedRate))
	}
	if view.Result == nil {
		return append(failures, "no final result")
	}
	offsets := view.Result.SceneOffsets
	for i := 1; i < len(offsets); i++ {
		if offsets[i] < offsets[i-1] {
			failures = append(failures, fmt.Sprintf("scene offsets not monotonic: %v", offsets))
			break
		}
	}
	if err := assertFtyp(view.Result.VideoKey); err != nil {
		failures = append(failures, err.Error())
	}
	return failures
}
