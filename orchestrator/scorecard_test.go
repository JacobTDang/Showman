package orchestrator

import "testing"

func TestComputeScorecard(t *testing.T) {
	s := &JobContext{Scenes: []SceneState{
		{Index: 0, Outcome: SceneOutcome{Source: SourceBuilder, Rung: 1}, Render: &SceneRender{Cached: true}},
		{Index: 1, Outcome: SceneOutcome{Source: SourceBuilder, Rung: 2}}, // re-corrected, not degraded
		{Index: 2, Outcome: SceneOutcome{Source: SourceFallback, Rung: 8, Degraded: true}},
		{Index: 3, Outcome: SceneOutcome{Source: SourceBuilder, Rung: 1}},
	}}
	card := ComputeScorecard(s)
	if card.Scenes != 4 {
		t.Fatalf("scenes: %d", card.Scenes)
	}
	if card.SourceDist.Builder != 0.75 || card.SourceDist.Fallback != 0.25 {
		t.Fatalf("source dist: %+v", card.SourceDist)
	}
	if card.DegradedRate != 0.25 || card.CachedRate != 0.25 || card.RepairRate != 0.25 {
		t.Fatalf("rates: %+v", card)
	}
	if empty := ComputeScorecard(&JobContext{}); empty.Scenes != 0 {
		t.Fatalf("empty job: %+v", empty)
	}
}
