package orchestrator

import "time"

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
//
// v1 -> v2 (B2): added the Resume field for the HITL preview-gate. This is a pure
// additive change — encoding/json leaves a missing field at its zero value (nil), so
// a v1 checkpoint decodes into the current struct with Resume == nil (never
// "awaiting review") with no migration code required. See TestV1CheckpointDecodesForward.
//
// v2 -> v3 (E1): added WebhookDeliveredAt. Also purely additive/nil-safe.
const StoreSchemaVersion = 3

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

	// Resume is set while the job sits at the HITL preview gate (B2/B3). Non-nil +
	// ResumedAt == nil means "awaiting review, resume not yet triggered." Once
	// POST /v1/jobs/:id/resume fires, ResumedAt is stamped (not cleared) so a second
	// POST is a no-op read of current status rather than a double-trigger or a 409.
	Resume *ResumeState `json:"resume,omitempty"`

	// WebhookDeliveredAt is set once Options.Webhook has been successfully POSTed
	// (E1). Nil means "not yet delivered" — checked before every delivery attempt
	// (deliverWebhook, and B4's boot scan for a terminal job that never got to
	// deliver before a restart) so the webhook fires exactly once.
	WebhookDeliveredAt *time.Time `json:"webhookDeliveredAt,omitempty"`
}

// ResumeState records the HITL preview-gate token for one interrupted run.
type ResumeState struct {
	Token     string     `json:"token"` // Eino interrupt id, passed to GenerateGraph.Resume
	At        time.Time  `json:"at"`    // when the gate was reached
	ResumedAt *time.Time `json:"resumedAt,omitempty"`
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
	// SpecBlob is the opaque assembled SceneSpec JSON, stored inline as a string so
	// checkpoints (incl. Eino graph interrupts) are self-contained across resume.
	SpecBlob  string         `json:"specBlob,omitempty"`
	Narration SceneNarration `json:"narration"`
	Render    *SceneRender   `json:"render,omitempty"`
	Outcome   SceneOutcome   `json:"outcome"`
	Attempts  int            `json:"attempts"`
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
