package orchestrator

import (
	"os"
	"path/filepath"
	"strings"
)

// Externalized prompts, mirroring the engine's prompts/ convention: each template is an
// editable file, overridable per deployment via SHOWMAN_PROMPT_DIR (e.g. a mounted
// volume) with built-in fallbacks so the orchestrator never crashes for lack of a file.
// Source-of-truth copies live in the repo's prompts/ directory.

const builtinPlannerSystem = `You are a lesson planner for short narrated educational videos for children.
Given a topic and a query, output ONLY a single JSON object (no prose, no markdown fences):
{"title":string,"theme":string,"throughline":string,"goals":[string],
 "scenes":[{"id":"beat-1","index":0,"title":string,"goal":string,"domainHint":"math|chem|physics|diagram|items (optional)",
            "keyPoints":[string],"narrationBeats":[string],"durationBudgetSec":number}],
 "narrationArc":{"intro":string,"outro":string}}
Rules: 2-5 scenes; indexes 0-based and sequential; each scene's goal is one concrete, visualizable idea;
narrationBeats are short spoken lines for a young audience; durations sum to roughly {{budget}} seconds.
Theme must be one of: sunshine, meadow, ocean, berry.`

const builtinSelectorSystem = `You choose visual builders for one scene of an educational video.
Available builders (pick by exact name and fill params from its schema):
{{catalog}}

Given the scene beat, output ONLY a JSON array (no prose, no fences) of 1-3 placements:
[{"builder":"<exact catalog name>","params":{...},"slot":"center|left|right|top|bottom (optional)","caption":"short label (optional)"}]
Rules: a scene-level builder [scene] must be used ALONE; node-level builders [node] may be combined.
Prefer one well-parameterized builder over many. Params must match the builder's schema types.`

// promptDir resolves the override directory (empty = use builtins only).
func promptDir() string {
	return os.Getenv("SHOWMAN_PROMPT_DIR")
}

// loadPrompt reads name from SHOWMAN_PROMPT_DIR, falling back to the builtin.
func loadPrompt(name, builtin string) string {
	if dir := promptDir(); dir != "" {
		if b, err := os.ReadFile(filepath.Join(dir, name)); err == nil && len(b) > 0 {
			return string(b)
		}
	}
	return builtin
}

// PlannerSystemPrompt returns the planner system prompt with the budget filled in.
func PlannerSystemPrompt(budgetSec int) string {
	t := loadPrompt("planner-system.md", builtinPlannerSystem)
	return strings.ReplaceAll(t, "{{budget}}", itoa(budgetSec))
}

// SelectorSystemPrompt returns the selector system prompt with the catalog digest filled in.
func SelectorSystemPrompt(catalogDigest string) string {
	t := loadPrompt("selector-system.md", builtinSelectorSystem)
	return strings.ReplaceAll(t, "{{catalog}}", catalogDigest)
}

func itoa(n int) string {
	if n <= 0 {
		return "90"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
