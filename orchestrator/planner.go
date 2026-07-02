package orchestrator

import (
	"context"
	"fmt"
	"strings"
)

// LessonPlanner turns the external request into a LessonPlan. The LLM planner arrives
// with the Eino graph; StubPlanner is the offline tier that keeps the whole pipeline
// runnable with zero API key, and the deterministic fallback thereafter.
type LessonPlanner interface {
	Plan(ctx context.Context, view PlannerView) (LessonPlan, error)
}

// StubPlanner emits a deterministic template plan: an intro beat, one main beat carrying
// the query as its goal, and a recap beat. Pure function of the request.
type StubPlanner struct{}

// Plan builds the template plan from the request.
func (StubPlanner) Plan(_ context.Context, view PlannerView) (LessonPlan, error) {
	req := view.Request
	topic := strings.TrimSpace(req.Topic)
	query := strings.TrimSpace(req.Query)
	if topic == "" && query == "" {
		return LessonPlan{}, fmt.Errorf("plan: topic and query are both empty")
	}
	if topic == "" {
		topic = query
	}
	if query == "" {
		query = topic
	}

	theme := req.Options.Theme
	if theme == "" {
		theme = "sunshine"
	}

	total := float64(view.DefaultBudget)
	maxScenes := req.Options.MaxScenes
	single := maxScenes == 1

	var beats []SceneBeat
	if single {
		beats = []SceneBeat{mainBeat(0, topic, query, total)}
	} else {
		intro := SceneBeat{
			ID: "beat-1", Index: 0, Title: title(topic),
			Goal:              "introduce the topic: " + topic,
			NarrationBeats:    []string{fmt.Sprintf("Today we're learning about %s!", topic)},
			DurationBudgetSec: clampSec(total*0.2, 3, 8),
		}
		main := mainBeat(1, topic, query, total)
		recap := SceneBeat{
			ID: "beat-3", Index: 2, Title: "Recap",
			Goal:              "recap what we learned about " + topic,
			NarrationBeats:    []string{fmt.Sprintf("Great job! Now you know about %s.", topic)},
			DurationBudgetSec: clampSec(total*0.2, 3, 8),
			DependsOn:         []string{"beat-2"},
		}
		beats = []SceneBeat{intro, main, recap}
	}

	return LessonPlan{
		Title:                  title(topic),
		Audience:               req.Options.Audience,
		Theme:                  theme,
		Throughline:            query,
		Goals:                  []string{query},
		Scenes:                 beats,
		NarrationArc:           NarrationArc{Intro: beats[0].NarrationBeats[0]},
		TotalDurationBudgetSec: total,
		ModelID:                "stub-planner/v1",
	}, nil
}

// mainBeat is the load-bearing scene: the query drives selection and params.
func mainBeat(index int, topic, query string, total float64) SceneBeat {
	return SceneBeat{
		ID:                fmt.Sprintf("beat-%d", index+1),
		Index:             index,
		Title:             title(topic),
		Goal:              query,
		KeyPoints:         []string{query},
		NarrationBeats:    []string{query},
		DurationBudgetSec: clampSec(total*0.6, 5, 30),
	}
}

func title(topic string) string {
	if len(topic) == 0 {
		return "Lesson"
	}
	return strings.ToUpper(topic[:1]) + topic[1:]
}

func clampSec(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
