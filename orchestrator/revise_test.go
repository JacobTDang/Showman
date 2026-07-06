package orchestrator

import (
	"context"
	"testing"
)

// TestReviseDegradedBeatSucceedsOnSecondShape is Roadmap C3's stated acceptance bar:
// a degraded main beat gets revised and succeeds on the second shape; history shows
// exactly one revision round. Reuses ladder_test.go's flakyEngine (fails Assemble for
// math.graphingLesson only) so the main beat ("graph the line y = 2x + 1") degrades
// to a fallback card exactly like TestLadderDegradesToCardInsteadOfFailingJob, but
// this time the planner is a real LLMPlanner (fakeChat) so C3's revise pass fires.
func TestReviseDegradedBeatSucceedsOnSecondShape(t *testing.T) {
	engine := &flakyEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p, _ := newTestPipeline(engine)
	p.Selector = NewKeywordSelector(engine)

	planJSON := `{"title":"Shapes","theme":"sunshine","throughline":"shapes and lines","goals":["learn about shapes"],
		"scenes":[
			{"id":"beat-1","index":0,"title":"Intro","goal":"introduce shapes","narrationBeats":["Let's learn about shapes!"],"durationBudgetSec":6},
			{"id":"beat-2","index":1,"title":"Main","goal":"graph the line y = 2x + 1","narrationBeats":["Here is a line."],"durationBudgetSec":10},
			{"id":"beat-3","index":2,"title":"Recap","goal":"recap shapes","narrationBeats":["Great job!"],"durationBudgetSec":6}
		],
		"narrationArc":{"intro":"Hi!","outro":"Bye!"}}`
	// The reviser's ONE replacement for the ONE degraded beat (the main scene): a
	// goal that keyword-selects a DIFFERENT builder flakyEngine doesn't reject.
	reviseJSON := `[{"id":"beat-2","index":1,"title":"Main","goal":"count five stars","narrationBeats":["Let's count!"],"durationBudgetSec":10}]`

	chat := &fakeChat{responses: []string{planJSON, reviseJSON}}
	p.Planner = &LLMPlanner{Model: chat}

	s, err := p.Run(context.Background(), "job-revise", ExternalRequest{Topic: "shapes", Query: "graph the line y = 2x + 1"})
	if err != nil {
		t.Fatalf("job should complete: %v", err)
	}
	if s.Phase != PhaseDone {
		t.Fatalf("want done, got %q", s.Phase)
	}

	main := s.Scenes[1]
	if main.Outcome.Degraded {
		t.Fatalf("the revised beat should have succeeded on its second shape: %+v", main.Outcome)
	}
	if main.Beat.Goal != "count five stars" {
		t.Fatalf("scene 1's beat should be the REVISED beat, got goal %q", main.Beat.Goal)
	}
	if len(main.Placements) == 0 || main.Placements[0].Builder != "math.countingLesson" {
		t.Fatalf("revised beat should have selected a different builder, got %+v", main.Placements)
	}
	if main.Render == nil || main.Render.Clip == nil {
		t.Fatalf("the revised scene must still render: %+v", main.Render)
	}

	revisions := 0
	for _, h := range s.History {
		if h.Kind == "BeatRevised" {
			revisions++
		}
	}
	if revisions != 1 {
		t.Fatalf("want exactly one revision round, got %d", revisions)
	}
	if chat.calls != 2 {
		t.Fatalf("want exactly 2 model calls (one plan + one revise), got %d", chat.calls)
	}
}

// TestReviseNeverRunsForOfflinePlanner: offline tiers (StubPlanner) never revise —
// the degraded scene stays a fallback card, no BeatRevised delta appears.
func TestReviseNeverRunsForOfflinePlanner(t *testing.T) {
	engine := &flakyEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p, _ := newTestPipeline(engine) // StubPlanner by default
	p.Selector = NewKeywordSelector(engine)

	s, err := p.Run(context.Background(), "job-no-revise", ExternalRequest{Topic: "shapes", Query: "graph the line y = 2x + 1"})
	if err != nil {
		t.Fatalf("job should still complete via the fallback card: %v", err)
	}
	for _, h := range s.History {
		if h.Kind == "BeatRevised" {
			t.Fatal("StubPlanner must never revise")
		}
	}
	if !s.Scenes[1].Outcome.Degraded {
		t.Fatalf("without a reviser the degraded scene should stay degraded: %+v", s.Scenes[1].Outcome)
	}
}

// TestBeatRevisedResetsDownstreamState: the BeatRevised delta must clear everything
// select/assemble/render produced for the OLD beat, not just swap the beat text —
// otherwise a stale spec/render could survive alongside a beat that no longer
// describes it.
func TestBeatRevisedResetsDownstreamState(t *testing.T) {
	s := &JobContext{Scenes: []SceneState{{
		Index:      0,
		Beat:       SceneBeat{Goal: "old goal"},
		Placements: []BuilderPlacement{{Builder: "items.card"}},
		SpecHash:   "old-hash",
		SpecBlob:   `{"old":true}`,
		Render:     &SceneRender{Status: RenderDone},
		Outcome:    SceneOutcome{Source: SourceFallback, Degraded: true, Rung: 8},
		Attempts:   2,
	}}}
	d := BeatRevised{Index: 0, Beat: SceneBeat{Goal: "new goal"}}
	if err := d.apply(s); err != nil {
		t.Fatal(err)
	}
	sc := s.Scenes[0]
	if sc.Beat.Goal != "new goal" {
		t.Fatalf("beat not replaced: %+v", sc.Beat)
	}
	if sc.Placements != nil || sc.SpecHash != "" || sc.SpecBlob != "" || sc.Render != nil || sc.Attempts != 0 {
		t.Fatalf("downstream state not reset: %+v", sc)
	}
	if sc.Outcome.Source != "" || sc.Outcome.Degraded || sc.Outcome.Rung != 0 {
		t.Fatalf("outcome not reset: %+v", sc.Outcome)
	}
}
