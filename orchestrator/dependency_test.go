package orchestrator

import "testing"

func TestDependencyIndexOnlyHonorsBackwardReferences(t *testing.T) {
	scenes := []SceneState{
		{Beat: SceneBeat{ID: "beat-1"}},                                        // 0: no deps
		{Beat: SceneBeat{ID: "beat-2", DependsOn: []string{"beat-1"}}},         // 1: valid backward dep
		{Beat: SceneBeat{ID: "beat-3", DependsOn: []string{"beat-4"}}},         // 2: forward ref -> ignored
		{Beat: SceneBeat{ID: "beat-4", DependsOn: []string{"beat-4"}}},         // 3: self-ref -> ignored
		{Beat: SceneBeat{ID: "beat-5", DependsOn: []string{"nope", "beat-2"}}}, // 4: unknown id ignored, valid one kept
	}
	deps := dependencyIndex(scenes)
	if len(deps[0]) != 0 {
		t.Fatalf("scene 0 should have no deps, got %v", deps[0])
	}
	if len(deps[1]) != 1 || deps[1][0] != 0 {
		t.Fatalf("scene 1 should depend on scene 0, got %v", deps[1])
	}
	if len(deps[2]) != 0 {
		t.Fatalf("a forward reference must be ignored, got %v", deps[2])
	}
	if len(deps[3]) != 0 {
		t.Fatalf("a self-reference must be ignored, got %v", deps[3])
	}
	if len(deps[4]) != 1 || deps[4][0] != 1 {
		t.Fatalf("scene 4 should depend only on scene 1 (unknown id dropped), got %v", deps[4])
	}
}
