package orchestrator

// Domain is the closed set of builder domains. "lesson" is not a domain — whole-scene
// lesson builders are distinguished by a catalog level ("scene") instead.
type Domain string

const (
	DomainMath    Domain = "math"
	DomainChem    Domain = "chem"
	DomainPhysics Domain = "physics"
	DomainDiagram Domain = "diagram"
	DomainItems   Domain = "items"
)

// AllDomains returns every domain in stable order.
func AllDomains() []Domain {
	return []Domain{DomainMath, DomainChem, DomainPhysics, DomainDiagram, DomainItems}
}

// Audience tunes pedagogy and the content-safety profile.
type Audience string

const (
	AudienceElementary   Audience = "elementary"
	AudienceMiddle       Audience = "middle"
	AudienceHigh         Audience = "high"
	AudienceIntroCollege Audience = "intro-college"
)

// ExternalRequest is the frozen tool input: { topic, query, options }.
type ExternalRequest struct {
	Topic   string               `json:"topic"`
	Query   string               `json:"query"`
	Options GenerateVideoOptions `json:"options"`
}

// GenerateVideoOptions are the optional knobs an outside agent may pass.
type GenerateVideoOptions struct {
	Audience          Audience `json:"audience,omitempty"`
	MaxScenes         int      `json:"maxScenes,omitempty"`
	TargetDurationSec int      `json:"targetDurationSec,omitempty"`
	Theme             string   `json:"theme,omitempty"`
	Voice             string   `json:"voice,omitempty"`
	Transition        string   `json:"transition,omitempty"` // "cut" (default) | "fade"
	Deterministic     bool     `json:"deterministic,omitempty"`
	CRF               int      `json:"crf,omitempty"`
	Preset            string   `json:"preset,omitempty"`
	Locale            string   `json:"locale,omitempty"`
	PreviewGate       bool     `json:"previewGate,omitempty"`
	Webhook           string   `json:"webhook,omitempty"`
}

// LessonPlan is the Lesson Planner's output: the narrative arc + ordered scene beats.
type LessonPlan struct {
	Title                  string       `json:"title"`
	Audience               Audience     `json:"audience"`
	Theme                  string       `json:"theme"` // chosen once, propagated to every scene
	Throughline            string       `json:"throughline"`
	Goals                  []string     `json:"goals"`
	Scenes                 []SceneBeat  `json:"scenes"`
	NarrationArc           NarrationArc `json:"narrationArc"`
	TotalDurationBudgetSec float64      `json:"totalDurationBudgetSec"`
	ModelID                string       `json:"modelId"` // snapshot for reproducibility
}

// SceneBeat is one planned scene before builder selection. id is stable across reorder;
// index is the final 0-based order (load-bearing for concat offsets).
type SceneBeat struct {
	ID                string   `json:"id"`
	Index             int      `json:"index"`
	Title             string   `json:"title"`
	Goal              string   `json:"goal"`
	DomainHint        Domain   `json:"domainHint,omitempty"` // soft, single, optional
	KeyPoints         []string `json:"keyPoints,omitempty"`
	MustShow          []string `json:"mustShow,omitempty"`
	MustReuse         []string `json:"mustReuse,omitempty"`
	Forbid            []string `json:"forbid,omitempty"`
	NarrationBeats    []string `json:"narrationBeats,omitempty"`
	DurationBudgetSec float64  `json:"durationBudgetSec"`
	DependsOn         []string `json:"dependsOn,omitempty"`
}

// NarrationArc is the cross-scene narration spine, keyed by beat id (robust to reorder).
type NarrationArc struct {
	Intro       string            `json:"intro,omitempty"`
	Outro       string            `json:"outro,omitempty"`
	Transitions map[string]string `json:"transitions,omitempty"`
}

// BuilderPlacement is the Domain Selector's canonical output: a catalog builder + params,
// plus declarative layout. params is one of the two deliberately-open seams (validated
// engine-side against the builder's JSON-Schema).
type BuilderPlacement struct {
	Builder string         `json:"builder"`
	Params  map[string]any `json:"params"`
	Slot    string         `json:"slot,omitempty"` // center|left|right|top|bottom|grid
	At      *Point         `json:"at,omitempty"`
	Scale   float64        `json:"scale,omitempty"`
	Caption string         `json:"caption,omitempty"`
	Animate string         `json:"animate,omitempty"` // auto|none|fadeIn|popIn|springIn|spinIn
	Ref     string         `json:"ref,omitempty"`     // reserved for entity reuse (v1 unused)
}

// Point is a canvas coordinate.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Palette is the shared scene palette.
type Palette struct {
	BG     string `json:"bg"`
	FG     string `json:"fg"`
	Accent string `json:"accent"`
	Muted  string `json:"muted"`
}

// Canvas is the single shared canvas all scenes render onto (enables -c copy concat).
type Canvas struct {
	Width  int `json:"width"`
	Height int `json:"height"`
	FPS    int `json:"fps"`
}

// RecapEntry is one completed scene's takeaway, the only cross-scene continuity carried
// forward (append-only).
type RecapEntry struct {
	SceneIndex int    `json:"sceneIndex"`
	Takeaway   string `json:"takeaway"`
}

// TimeBudget allocates the duration budget across scenes.
type TimeBudget struct {
	TotalTargetSec float64       `json:"totalTargetSec"`
	HardMaxSec     float64       `json:"hardMaxSec"`
	ReservedSec    float64       `json:"reservedSec"`
	Scenes         []SceneBudget `json:"scenes"`
}

// SceneBudget is the per-scene slice of the time budget.
type SceneBudget struct {
	Index     int     `json:"index"`
	TargetSec float64 `json:"targetSec"`
	MinSec    float64 `json:"minSec"`
	MaxSec    float64 `json:"maxSec"`
	ActualSec float64 `json:"actualSec,omitempty"`
}

// NarrationSegment is one timed line of spoken narration within a scene.
type NarrationSegment struct {
	Text     string  `json:"text"`
	StartSec float64 `json:"startSec"`
	DurSec   float64 `json:"durSec"`
}

// SceneNarration is a scene's narration track.
type SceneNarration struct {
	Segments []NarrationSegment `json:"segments,omitempty"`
	Voice    string             `json:"voice,omitempty"`
}
