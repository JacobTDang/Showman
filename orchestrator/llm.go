package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

// The LLM tiers: an Eino ChatModel-backed planner and selector. Both sit behind the
// same interfaces as the offline tiers, and production wiring wraps them in Fallback*
// so the design's precedence holds: LLM -> offline -> (selector only) counting lesson.
// Tests inject a fake model.BaseChatModel; production uses eino-ext's OpenAI-compatible
// model pointed at OpenRouter/vLLM/Ollama via env.

// NewOpenAIChatModel builds the production chat model from the environment:
// OPENROUTER_API_KEY (required), OPENROUTER_BASE_URL, OPENROUTER_MODEL.
// Returns nil when no key is configured (callers then run offline tiers only).
func NewOpenAIChatModel(ctx context.Context, env func(string) string) (model.BaseChatModel, error) {
	key := env("OPENROUTER_API_KEY")
	if key == "" {
		return nil, nil
	}
	base := env("OPENROUTER_BASE_URL")
	if base == "" {
		base = "https://openrouter.ai/api/v1"
	}
	modelID := env("OPENROUTER_MODEL")
	if modelID == "" {
		modelID = "openai/gpt-oss-120b"
	}
	temp := float32(0.3)
	return openai.NewChatModel(ctx, &openai.ChatModelConfig{
		APIKey:      key,
		BaseURL:     base,
		Model:       modelID,
		Temperature: &temp,
		Timeout:     90 * time.Second,
	})
}

// LLMPlanner plans a lesson with one chat call.
type LLMPlanner struct {
	Model model.BaseChatModel
}

// Plan asks the model for a LessonPlan JSON and normalizes it.
func (p *LLMPlanner) Plan(ctx context.Context, view PlannerView) (LessonPlan, error) {
	system := PlannerSystemPrompt(view.DefaultBudget)
	user := fmt.Sprintf("Topic: %s\nQuery: %s\nAudience: %s", view.Request.Topic, view.Request.Query, view.Request.Options.Audience)
	out, err := p.Model.Generate(ctx, []*schema.Message{schema.SystemMessage(system), schema.UserMessage(user)})
	if err != nil {
		return LessonPlan{}, fmt.Errorf("llm plan: %w", err)
	}
	raw, err := extractJSON(out.Content)
	if err != nil {
		return LessonPlan{}, fmt.Errorf("llm plan: %w", err)
	}
	var plan LessonPlan
	if err := json.Unmarshal(raw, &plan); err != nil {
		return LessonPlan{}, fmt.Errorf("llm plan: decode: %w", err)
	}
	return normalizePlan(plan, view)
}

// normalizePlan enforces the invariants the pipeline depends on (mechanical, no LLM):
// sequential ids/indexes, non-empty scenes/goals, sane durations, a known theme.
func normalizePlan(plan LessonPlan, view PlannerView) (LessonPlan, error) {
	if len(plan.Scenes) == 0 {
		return LessonPlan{}, fmt.Errorf("llm plan: zero scenes")
	}
	if len(plan.Scenes) > 8 {
		plan.Scenes = plan.Scenes[:8]
	}
	for i := range plan.Scenes {
		sc := &plan.Scenes[i]
		sc.Index = i
		sc.ID = fmt.Sprintf("beat-%d", i+1)
		if strings.TrimSpace(sc.Goal) == "" {
			return LessonPlan{}, fmt.Errorf("llm plan: scene %d has no goal", i)
		}
		if sc.DurationBudgetSec <= 0 || sc.DurationBudgetSec > 60 {
			sc.DurationBudgetSec = clampSec(float64(view.DefaultBudget)/float64(len(plan.Scenes)), 3, 30)
		}
	}
	smoothDurations(plan.Scenes, float64(view.DefaultBudget))
	switch plan.Theme {
	case "sunshine", "meadow", "ocean", "berry":
	default:
		plan.Theme = "sunshine"
	}
	if plan.Title == "" {
		plan.Title = title(view.Request.Topic)
	}
	plan.TotalDurationBudgetSec = float64(view.DefaultBudget)
	plan.ModelID = "llm-planner/v1"
	return plan, nil
}

// durationRatioFactor bounds each scene to [avg/f, avg*f]. Since max/min <= f*f for any
// two values drawn from that band, f = sqrt(3) keeps the worst-case ratio at 3 by
// construction — not by hoping a scale-then-clamp pass doesn't let an extreme escape.
const durationRatioFactor = 1.7 // sqrt(3) ~= 1.732; 1.7 leaves a small safety margin

// smoothDurations evens out ragged LLM scene budgets (C1: a live run produced
// 20s/4.8s/30s against a 60s total). Every scene is clamped into a band around the
// per-scene average (totalBudget/n), so the resulting max/min ratio is bounded
// regardless of how ragged the model's raw numbers were. The assembler still
// stretches any scene whose narration genuinely needs more time — this smooths
// targets, it does not cut speech.
func smoothDurations(scenes []SceneBeat, totalBudget float64) {
	n := len(scenes)
	if n == 0 || totalBudget <= 0 {
		return
	}
	avg := totalBudget / float64(n)
	lo, hi := avg/durationRatioFactor, avg*durationRatioFactor
	for i := range scenes {
		v := clampSec(scenes[i].DurationBudgetSec, lo, hi)
		scenes[i].DurationBudgetSec = clampSec(v, 3, 30) // absolute floor/ceiling
	}
}

// LLMSelector picks builders for one beat with one chat call, validated against the
// catalog before anything ships to /assemble.
type LLMSelector struct {
	Model  model.BaseChatModel
	Engine EngineClient
}

// Select prompts with the beat + compact catalog digest and validates the placements.
// When the view carries Feedback (a re-correct pass), the previous attempt's errors are
// included so the model can fix them instead of repeating them.
func (s *LLMSelector) Select(ctx context.Context, view SelectorView) ([]BuilderPlacement, error) {
	system := SelectorSystemPrompt(view.CatalogDigest)
	beatJSON, _ := json.Marshal(view.Beat)
	user := "Scene beat:\n" + string(beatJSON)
	if len(view.Feedback) > 0 {
		fb, _ := json.Marshal(view.Feedback)
		user += "\n\nYour previous placements failed validation. Fix EXACTLY these errors:\n" + string(fb)
	}
	out, err := s.Model.Generate(ctx, []*schema.Message{schema.SystemMessage(system), schema.UserMessage(user)})
	if err != nil {
		return nil, fmt.Errorf("llm select: %w", err)
	}
	raw, err := extractJSON(out.Content)
	if err != nil {
		return nil, fmt.Errorf("llm select: %w", err)
	}
	var placements []BuilderPlacement
	if err := json.Unmarshal(raw, &placements); err != nil {
		// Tolerate a single object instead of an array.
		var one BuilderPlacement
		if err2 := json.Unmarshal(raw, &one); err2 != nil {
			return nil, fmt.Errorf("llm select: decode: %w", err)
		}
		placements = []BuilderPlacement{one}
	}
	if len(placements) == 0 {
		return nil, fmt.Errorf("llm select: zero placements")
	}
	// Validate builder names against the catalog (unknown names fail here, cheaply,
	// instead of at /assemble).
	tools, err := s.Engine.Catalog(ctx, "")
	if err != nil {
		return nil, err
	}
	known := map[string]bool{}
	for _, t := range tools {
		known[t.Name] = true
	}
	for _, p := range placements {
		if !known[p.Builder] {
			return nil, fmt.Errorf("llm select: unknown builder %q", p.Builder)
		}
	}
	return placements, nil
}

// Reviser lets a planner replace specific degraded beats after the first fan-out
// pass (Roadmap C3: the one bounded re-plan rung). Only the LLM tier implements
// it — offline tiers (StubPlanner, and FallbackPlanner when every LLM tier is
// exhausted) never revise, since there's no model call to make a better second
// attempt with.
type Reviser interface {
	Revise(ctx context.Context, view ReviseView) ([]SceneBeat, error)
}

// FailedBeat is one degraded scene handed back to the reviser: its original beat
// plus a short reason it failed the first time.
type FailedBeat struct {
	Beat  SceneBeat
	Error string
}

// ReviseView is what a Reviser sees: the request for context, plus every beat that
// degraded to a fallback card and why.
type ReviseView struct {
	Request ExternalRequest
	Failed  []FailedBeat
}

// Revise asks the model to replace just the failed beats, in the same order. Returns
// exactly len(view.Failed) beats or an error; the pipeline treats a short/garbled
// reply as a failed revision (best-effort — the fallback cards already in place
// stand).
func (p *LLMPlanner) Revise(ctx context.Context, view ReviseView) ([]SceneBeat, error) {
	system := ReviserSystemPrompt()
	failedJSON, _ := json.Marshal(view.Failed)
	user := fmt.Sprintf("Topic: %s\nQuery: %s\n\nThese beats failed and fell back to a plain card. Replace EACH ONE with a\nbetter beat (same order, one replacement per input):\n%s",
		view.Request.Topic, view.Request.Query, string(failedJSON))
	out, err := p.Model.Generate(ctx, []*schema.Message{schema.SystemMessage(system), schema.UserMessage(user)})
	if err != nil {
		return nil, fmt.Errorf("llm revise: %w", err)
	}
	raw, err := extractJSON(out.Content)
	if err != nil {
		return nil, fmt.Errorf("llm revise: %w", err)
	}
	var beats []SceneBeat
	if err := json.Unmarshal(raw, &beats); err != nil {
		return nil, fmt.Errorf("llm revise: decode: %w", err)
	}
	if len(beats) != len(view.Failed) {
		return nil, fmt.Errorf("llm revise: got %d beats, want %d", len(beats), len(view.Failed))
	}
	for i := range beats {
		if strings.TrimSpace(beats[i].Goal) == "" {
			return nil, fmt.Errorf("llm revise: beat %d has no goal", i)
		}
		if beats[i].DurationBudgetSec <= 0 || beats[i].DurationBudgetSec > 60 {
			beats[i].DurationBudgetSec = view.Failed[i].Beat.DurationBudgetSec
		}
	}
	return beats, nil
}

// FallbackPlanner tries each planner in order (the design's quality ladder).
type FallbackPlanner struct{ Tiers []LessonPlanner }

// Plan returns the first tier's successful plan.
func (f FallbackPlanner) Plan(ctx context.Context, view PlannerView) (LessonPlan, error) {
	var lastErr error
	for _, tier := range f.Tiers {
		plan, err := tier.Plan(ctx, view)
		if err == nil {
			return plan, nil
		}
		lastErr = err
	}
	return LessonPlan{}, fmt.Errorf("all planner tiers failed: %w", lastErr)
}

// Revise delegates to the first tier that implements Reviser (the LLM tier, when
// present) — so production's FallbackPlanner{LLMPlanner, StubPlanner} supports
// revision without the pipeline needing to know about the concrete tier types.
func (f FallbackPlanner) Revise(ctx context.Context, view ReviseView) ([]SceneBeat, error) {
	for _, tier := range f.Tiers {
		if r, ok := tier.(Reviser); ok {
			return r.Revise(ctx, view)
		}
	}
	return nil, fmt.Errorf("no planner tier supports revision")
}

// FallbackSelector tries each selector in order.
type FallbackSelector struct{ Tiers []DomainSelector }

// Select returns the first tier's successful placements.
func (f FallbackSelector) Select(ctx context.Context, view SelectorView) ([]BuilderPlacement, error) {
	var lastErr error
	for _, tier := range f.Tiers {
		placements, err := tier.Select(ctx, view)
		if err == nil {
			return placements, nil
		}
		lastErr = err
	}
	return nil, fmt.Errorf("all selector tiers failed: %w", lastErr)
}

// extractJSON slices the first balanced JSON value (object or array) out of possibly
// chatty / fenced model output — the Go analogue of the engine's tolerant extractor.
func extractJSON(text string) (json.RawMessage, error) {
	// Strip a markdown fence if present.
	if i := strings.Index(text, "```"); i >= 0 {
		rest := text[i+3:]
		rest = strings.TrimPrefix(rest, "json")
		rest = strings.TrimPrefix(rest, "JSON")
		if j := strings.Index(rest, "```"); j >= 0 {
			text = rest[:j]
		}
	}
	start := strings.IndexAny(text, "{[")
	if start < 0 {
		return nil, fmt.Errorf("no JSON in model output")
	}
	open := text[start]
	var close byte = '}'
	if open == '[' {
		close = ']'
	}
	depth := 0
	inStr := false
	esc := false
	for i := start; i < len(text); i++ {
		ch := text[i]
		if inStr {
			switch {
			case esc:
				esc = false
			case ch == '\\':
				esc = true
			case ch == '"':
				inStr = false
			}
			continue
		}
		switch ch {
		case '"':
			inStr = true
		case open:
			depth++
		case close:
			depth--
			if depth == 0 {
				candidate := text[start : i+1]
				if !json.Valid([]byte(candidate)) {
					return nil, fmt.Errorf("model output is not valid JSON")
				}
				return json.RawMessage(candidate), nil
			}
		}
	}
	return nil, fmt.Errorf("unbalanced JSON in model output")
}
