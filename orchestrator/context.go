package orchestrator

import (
	"encoding/json"
	"time"
)

// JobPhase is the orchestrator's monotonic job state. "stitching" covers concat + mux.
type JobPhase string

const (
	PhaseQueued     JobPhase = "queued"
	PhasePlanning   JobPhase = "planning"
	PhaseSelecting  JobPhase = "selecting"
	PhaseAssembling JobPhase = "assembling"
	PhaseRendering  JobPhase = "rendering"
	PhaseStitching  JobPhase = "stitching"
	PhaseDone       JobPhase = "done"
	PhaseError      JobPhase = "error"
)

// StoreSchemaVersion is the JobContext schema version (NOT the engine specVersion). It
// gates checkpoint migration when the store shape changes.
const StoreSchemaVersion = 1

// JobContext is the single, durable, strongly-typed state store for one generate job. It
// is also the value used as the Eino graph's local state. Every field is typed; the only
// open seams are BuilderPlacement.Params and the opaque per-scene SpecBlob.
type JobContext struct {
	JobID         string          `json:"jobId"`
	Request       ExternalRequest `json:"request"`
	RequestHash   string          `json:"requestHash"` // sha256(canonical(request)) — dedup
	RootSeed      int64           `json:"rootSeed"`    // determinism root
	SchemaVersion int             `json:"schemaVersion"`
	CreatedAt     time.Time       `json:"createdAt"`
	UpdatedAt     time.Time       `json:"updatedAt"`

	Phase      JobPhase        `json:"phase"`
	Plan       *LessonPlan     `json:"plan,omitempty"`
	Continuity ContinuityState `json:"continuity"`
	Budget     TimeBudget      `json:"budget"`
	Scenes     []SceneState    `json:"scenes"`
	Final      *FinalAssembly  `json:"final,omitempty"`

	History  []NodeRunRecord `json:"history"` // append-only audit
	Warnings []string        `json:"warnings,omitempty"`
	Error    *JobError       `json:"error,omitempty"`
}

// NewJobContext seeds a fresh job: identity, request hash, and determinism root.
func NewJobContext(jobID string, req ExternalRequest, now time.Time) (*JobContext, error) {
	hash, err := RequestHash(req)
	if err != nil {
		return nil, err
	}
	return &JobContext{
		JobID:         jobID,
		Request:       req,
		RequestHash:   hash,
		RootSeed:      RootSeed(hash),
		SchemaVersion: StoreSchemaVersion,
		CreatedAt:     now,
		UpdatedAt:     now,
		Phase:         PhaseQueued,
		History:       []NodeRunRecord{},
	}, nil
}

// ContinuityState is the only cross-scene shared context: shared visual identity plus a
// one-directional recap thread. Minimal and append-only by design.
type ContinuityState struct {
	Theme   string       `json:"theme"`
	Palette Palette      `json:"palette"`
	Canvas  Canvas       `json:"canvas"`
	Recap   []RecapEntry `json:"recap"`
}

// SceneState is the per-scene slice of the store.
type SceneState struct {
	Index      int                `json:"index"`
	Beat       SceneBeat          `json:"beat"`
	Placements []BuilderPlacement `json:"placements,omitempty"`
	SpecHash   string             `json:"specHash,omitempty"`
	// SpecBlob is the opaque assembled SceneSpec. It is stored out-of-line (json:"-") so
	// the JobContext checkpoint stays small; the Director persists it separately.
	SpecBlob  json.RawMessage `json:"-"`
	Narration SceneNarration  `json:"narration"`
	Render    *SceneRender    `json:"render,omitempty"`
	Outcome   SceneOutcome    `json:"outcome"`
	Attempts  int             `json:"attempts"`
}

// SceneRenderStatus is the lifecycle of one scene's clip render.
type SceneRenderStatus string

const (
	RenderPending  SceneRenderStatus = "pending"
	RenderRunning  SceneRenderStatus = "running"
	RenderDone     SceneRenderStatus = "done"
	RenderError    SceneRenderStatus = "error"
	RenderCached   SceneRenderStatus = "cached"
	RenderFallback SceneRenderStatus = "fallback"
)

// SceneRender records the rendered clip + its narration audio.
type SceneRender struct {
	Status       SceneRenderStatus `json:"status"`
	Clip         *ObjectRef        `json:"clip,omitempty"`
	NarrationWav *ObjectRef        `json:"narrationWav,omitempty"`
	DurationSec  float64           `json:"durationSec,omitempty"`
	Cached       bool              `json:"cached,omitempty"`
}

// SceneSource is where a scene's spec came from on the quality ladder.
type SceneSource string

const (
	SourceBuilder    SceneSource = "builder"
	SourceFreeAuthor SceneSource = "free-author"
	SourceFallback   SceneSource = "fallback"
)

// SceneOutcome is the per-scene quality-ladder result (feeds evals).
type SceneOutcome struct {
	Index    int         `json:"index"`
	Source   SceneSource `json:"source"`
	Status   string      `json:"status"` // ok|repaired|fallback|dropped
	Rung     int         `json:"rung"`
	Attempts int         `json:"attempts"`
	LLMCalls int         `json:"llmCalls"`
	Repairs  []string    `json:"repairs,omitempty"`
	Warnings []string    `json:"warnings,omitempty"`
	Degraded bool        `json:"degraded"`
}

// FinalAssembly is the stitched result.
type FinalAssembly struct {
	VideoKey     string    `json:"videoKey"`
	VideoURL     string    `json:"videoUrl"`
	CaptionsKey  string    `json:"captionsKey,omitempty"`
	CaptionsSRT  string    `json:"captionsSrt,omitempty"`
	DurationSec  float64   `json:"durationSec"`
	SceneOffsets []float64 `json:"sceneOffsets"`
}

// NodeRunRecord is one append-only audit entry for a folded-in delta.
type NodeRunRecord struct {
	Kind string    `json:"kind"`
	At   time.Time `json:"at"`
	Note string    `json:"note,omitempty"`
}

// JobError is a terminal job failure.
type JobError struct {
	Node       string `json:"node"`
	SceneIndex *int   `json:"sceneIndex,omitempty"`
	Message    string `json:"message"`
	Retryable  bool   `json:"retryable"`
}

// ObjectRef is a stored-object handle (key + optional URL).
type ObjectRef struct {
	Key string `json:"key"`
	URL string `json:"url,omitempty"`
}
