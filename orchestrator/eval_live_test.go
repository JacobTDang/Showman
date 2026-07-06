//go:build e2e_live

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

// TestLiveE2EEval is Roadmap D2: the same shape as D1's offline eval, but through
// the LLM tiers (LLMPlanner + LLMSelector via OPENROUTER_API_KEY) instead of the
// offline StubPlanner/KeywordSelector. Pre-wired but dormant: the workflow that runs
// this (.github/workflows/live-evals.yml) checks the secret first and exits neutral
// if it's absent, so this test SKIPS locally/in normal CI rather than failing when
// no key is configured — the day a key is rotated in, nightly evals just start.
//
// Unlike D1 (which deliberately excludes topics needing structured params a regex
// can't fill — circuits, molecules, charts), this suite includes them: a real LLM
// can fill an arbitrary element list / SMILES string / data series, which is
// precisely the capability gap D1's PR description flagged as offline-only.
func TestLiveE2EEval(t *testing.T) {
	ctx := context.Background()
	chat, err := NewOpenAIChatModel(ctx, os.Getenv)
	if err != nil {
		t.Fatalf("chat model: %v", err)
	}
	if chat == nil {
		t.Skip("OPENROUTER_API_KEY not set — live eval is dormant until a key is configured")
	}

	repoRoot := findRepoRoot(t)
	dataDir := t.TempDir()
	outDir := t.TempDir()

	enginePort := startEngine(t, repoRoot, dataDir)
	engine := NewHTTPEngineClient(fmt.Sprintf("http://127.0.0.1:%d", enginePort), 2*time.Minute)

	checkpoint := NewInMemoryCheckpointStore()
	pipeline := &Pipeline{
		Director: NewDirector(checkpoint, nil),
		Planner:  FallbackPlanner{Tiers: []LessonPlanner{&LLMPlanner{Model: chat}, StubPlanner{}}},
		Selector: FallbackSelector{Tiers: []DomainSelector{&LLMSelector{Model: chat, Engine: engine}, NewKeywordSelector(engine)}},
		Engine:   engine,
		Stitcher: &FFmpegStitcher{Fetcher: engine, OutDir: outDir},
	}
	graph, err := BuildGenerateGraph(ctx, pipeline, NewEinoByteStore())
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{Pipeline: pipeline, Graph: graph, Checkpoint: checkpoint}
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	topics := []struct {
		topic      string
		query      string
		acceptable []string // at least one scene must pick a builder from this set
	}{
		{"counting", "count to five with stars", []string{"math.countingLesson", "math.dotPattern", "math.numberLine"}},
		{"fractions", "show the fraction 3/4 as a pie", []string{"math.fractionLesson", "math.fractionCircle", "math.fractionBar", "math.numberLineFraction"}},
		{"graphing", "graph the line y = 2x + 1 on a coordinate plane", []string{"math.graphingLesson", "math.functionGraph"}},
		{"circuits", "wire a series circuit with a battery and a resistor", []string{"physics.circuit"}},
		{"molecules", "show the structure of the water molecule", []string{"chem.molecule", "chem.reaction"}},
		{"data", "chart quarterly revenue as a bar chart", []string{"chart.bar", "math.dataLesson", "math.barGraph", "math.pictograph"}},
	}

	type jobResult struct {
		Topic       string    `json:"topic"`
		Query       string    `json:"query"`
		JobID       string    `json:"jobId"`
		Scorecard   Scorecard `json:"scorecard"`
		DurationSec float64   `json:"durationSec"`
		Builders    []string  `json:"builders"`
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

		// LLM round-trips are slow relative to the offline eval; give this a lot of room.
		view := pollJobDone(t, ts, accepted.JobID, 5*time.Minute)
		stored, loadErr := checkpoint.Load(ctx, accepted.JobID)

		jr := jobResult{Topic: tc.topic, Query: tc.query, JobID: accepted.JobID}
		if view.Scorecard != nil {
			jr.Scorecard = *view.Scorecard
		}
		if view.Result != nil {
			jr.DurationSec = view.Result.DurationSec
		}
		if loadErr == nil {
			for _, sc := range stored.Scenes {
				for _, pl := range sc.Placements {
					jr.Builders = append(jr.Builders, pl.Builder)
				}
			}
		}
		jr.Failures = evalLiveJob(view, stored, loadErr, tc.acceptable)
		jr.Passed = len(jr.Failures) == 0
		results = append(results, jr)
	}

	artifactPath := filepath.Join(repoRoot, "orchestrator", "eval-live-scorecards.json")
	if data, err := json.MarshalIndent(results, "", "  "); err == nil {
		_ = os.WriteFile(artifactPath, data, 0o644)
	}

	for _, r := range results {
		for _, f := range r.Failures {
			t.Errorf("%s (%q): %s", r.Topic, r.Query, f)
		}
	}
}

// evalLiveJob checks D2's acceptance bar: the job finished, the plan is coherent
// (a sane scene count and, post-C1, a bounded duration spread across the LLM's own
// beats), and at least one scene's builder is in the topic's acceptable set.
func evalLiveJob(view JobView, stored *JobContext, loadErr error, acceptable []string) []string {
	var failures []string
	if view.Status != PhaseDone {
		return []string{fmt.Sprintf("job did not finish: status=%s error=%+v", view.Status, view.Error)}
	}
	if loadErr != nil || stored == nil || stored.Plan == nil {
		return []string{fmt.Sprintf("could not inspect the stored plan: %v", loadErr)}
	}

	n := len(stored.Plan.Scenes)
	if n < 1 || n > 12 {
		failures = append(failures, fmt.Sprintf("scene-count sanity: %d scenes (want 1-12)", n))
	}

	// Post-C1 budget spread: smoothDurations bounds max/min to <= 3 (see llm.go).
	// The endcard is appended AFTER smoothing with its own fixed duration, so it's
	// excluded here rather than skewing the ratio.
	beats := stored.Plan.Scenes
	minD, maxD := 0.0, 0.0
	for _, b := range beats {
		d := b.DurationBudgetSec
		if d <= 0 {
			continue
		}
		if minD == 0 || d < minD {
			minD = d
		}
		if d > maxD {
			maxD = d
		}
	}
	if minD > 0 && maxD/minD > 3.5 { // small slack over C1's exact 3.0 guarantee
		failures = append(failures, fmt.Sprintf("duration spread too ragged: min=%.1f max=%.1f", minD, maxD))
	}

	if len(acceptable) > 0 {
		hit := false
	scenes:
		for _, sc := range stored.Scenes {
			for _, pl := range sc.Placements {
				for _, want := range acceptable {
					if pl.Builder == want {
						hit = true
						break scenes
					}
				}
			}
		}
		if !hit {
			failures = append(failures, fmt.Sprintf("no scene picked a builder from the acceptable set %v", acceptable))
		}
	}

	if view.Result != nil {
		if err := assertFtyp(view.Result.VideoKey); err != nil {
			failures = append(failures, err.Error())
		}
	}
	return failures
}
