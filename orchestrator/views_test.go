package orchestrator

import (
	"context"
	"testing"
	"time"
)

func TestSelectViewProjectsBeatTailAndTheme(t *testing.T) {
	s := &JobContext{
		Continuity: ContinuityState{
			Theme: "meadow",
			Recap: []RecapEntry{{SceneIndex: 0, Takeaway: "a"}, {SceneIndex: 1, Takeaway: "b"}, {SceneIndex: 2, Takeaway: "c"}},
		},
		Scenes: []SceneState{{Index: 3, Beat: SceneBeat{ID: "beat-4", Goal: "graph a line"}}},
	}
	v := SelectView(s, 0, "DIGEST")
	if v.Theme != "meadow" || v.CatalogDigest != "DIGEST" {
		t.Fatalf("theme/digest not projected: %+v", v)
	}
	if v.Beat.ID != "beat-4" {
		t.Fatalf("beat not projected")
	}
	if len(v.RecapTail) != 2 || v.RecapTail[0].Takeaway != "b" || v.RecapTail[1].Takeaway != "c" {
		t.Fatalf("recap tail should be the last 2 entries, got %+v", v.RecapTail)
	}
}

func TestPlanViewUsesRequestedBudget(t *testing.T) {
	s := &JobContext{Request: ExternalRequest{Options: GenerateVideoOptions{TargetDurationSec: 120}}}
	if got := PlanView(s).DefaultBudget; got != 120 {
		t.Fatalf("want requested budget 120, got %d", got)
	}
	empty := &JobContext{}
	if got := PlanView(empty).DefaultBudget; got != defaultBudgetSec {
		t.Fatalf("want default budget %d, got %d", defaultBudgetSec, got)
	}
	if len(PlanView(empty).Domains) != 5 {
		t.Fatalf("expected all 5 domains")
	}
}

func TestAsmInputComposesNarrationLineup(t *testing.T) {
	plan := LessonPlan{
		Scenes: []SceneBeat{{ID: "beat-1"}, {ID: "beat-2"}, {ID: "beat-3"}},
		NarrationArc: NarrationArc{
			Intro:       "Welcome to fractions!",
			Outro:       "Great job today.",
			Transitions: map[string]string{"beat-2": "Now let's slice the pie."},
		},
	}
	s := &JobContext{
		Plan: &plan,
		Scenes: []SceneState{
			{Index: 0, Beat: SceneBeat{ID: "beat-1", NarrationBeats: []string{"a"}}},
			{Index: 1, Beat: SceneBeat{ID: "beat-2", NarrationBeats: []string{"b"}}},
			{Index: 2, Beat: SceneBeat{ID: "beat-3", NarrationBeats: []string{"c"}}},
		},
	}
	// Scene 0: intro lead-in.
	got0 := AsmInput(s, 0).Beat.NarrationBeats
	if len(got0) != 2 || got0[0] != "Welcome to fractions!" || got0[1] != "a" {
		t.Fatalf("scene 0 lineup: %v", got0)
	}
	// Scene 1: its transition leads.
	got1 := AsmInput(s, 1).Beat.NarrationBeats
	if len(got1) != 2 || got1[0] != "Now let's slice the pie." {
		t.Fatalf("scene 1 lineup: %v", got1)
	}
	// Last scene: outro appended.
	got2 := AsmInput(s, 2).Beat.NarrationBeats
	if len(got2) != 2 || got2[1] != "Great job today." {
		t.Fatalf("scene 2 lineup: %v", got2)
	}
	// The store itself is never mutated by the projection.
	if len(s.Scenes[0].Beat.NarrationBeats) != 1 {
		t.Fatalf("projection mutated the store: %v", s.Scenes[0].Beat.NarrationBeats)
	}
}

func TestAsmInputCarriesSeedAndPrevRecap(t *testing.T) {
	root := RootSeed("h")
	s := &JobContext{
		RootSeed:   root,
		Continuity: ContinuityState{Theme: "ocean", Recap: []RecapEntry{{SceneIndex: 0, Takeaway: "prev"}}},
		Scenes:     []SceneState{{Index: 0}, {Index: 1, Placements: []BuilderPlacement{{Builder: "math.numberLine"}}}},
	}
	in := AsmInput(s, 1)
	if in.Seed != SceneSeed(root, 1) {
		t.Fatalf("assembler input must carry the per-scene seed")
	}
	if in.PrevRecap == nil || in.PrevRecap.Takeaway != "prev" {
		t.Fatalf("assembler input must carry the previous recap")
	}
	if len(in.Placements) != 1 || in.Placements[0].Builder != "math.numberLine" {
		t.Fatalf("placements not projected")
	}
}

func TestNewJobContextSeedsIdentity(t *testing.T) {
	req := ExternalRequest{Topic: "x", Query: "y"}
	s, err := NewJobContext("job-1", req, time.Unix(5, 0))
	if err != nil {
		t.Fatal(err)
	}
	if s.RequestHash == "" || s.RootSeed < 0 || s.SchemaVersion != StoreSchemaVersion {
		t.Fatalf("identity not seeded: %+v", s)
	}
	if s.Phase != PhaseQueued {
		t.Fatalf("want queued, got %q", s.Phase)
	}
	// Round-trip through a checkpoint preserves the typed fields (minus the out-of-line blob).
	cp := NewInMemoryCheckpointStore()
	if err := cp.Save(context.Background(), s); err != nil {
		t.Fatal(err)
	}
	got, err := cp.Load(context.Background(), "job-1")
	if err != nil {
		t.Fatal(err)
	}
	if got.RequestHash != s.RequestHash || got.RootSeed != s.RootSeed {
		t.Fatalf("checkpoint round-trip lost identity")
	}
}
