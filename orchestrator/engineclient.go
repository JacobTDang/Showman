package orchestrator

import (
	"context"
	"encoding/json"
)

// EngineClient is the contract for the deterministic TS engine's HTTP capabilities. The
// orchestrator calls these for the catalog, spec building/assembly, and rendering. A built
// SceneSpec is opaque here (json.RawMessage) — the orchestrator never owns the spec types.
//
// The HTTP implementation lands when the engine endpoints exist; this interface lets the
// orchestrator be wired and tested against a fake in the meantime.
type EngineClient interface {
	// Catalog lists the builder tools for a domain (empty domain = all).
	Catalog(ctx context.Context, domain Domain) ([]CatalogEntry, error)
	// CatalogDigest returns the token-frugal catalog text for a domain (for selector prompts).
	CatalogDigest(ctx context.Context, domain Domain) (string, error)
	// Build invokes one builder with params, returning a node or whole-scene spec.
	Build(ctx context.Context, req BuildRequest) (BuildResult, error)
	// Assemble turns placements into one validated, repaired SceneSpec (+ content hash).
	Assemble(ctx context.Context, req AssembleRequest) (AssembleResult, error)
	// Render renders a spec to a stored clip; Cached reports an engine cache hit.
	Render(ctx context.Context, req RenderRequest) (RenderResult, error)
}

// CatalogEntry is one self-describing builder tool.
type CatalogEntry struct {
	Name        string          `json:"name"`
	Domain      Domain          `json:"domain"`
	Level       string          `json:"level"` // "scene" | "node"
	Description string          `json:"description"`
	Keywords    []string        `json:"keywords"`
	JSONSchema  json.RawMessage `json:"jsonSchema"`
}

// BuildRequest invokes a single builder.
type BuildRequest struct {
	Builder string         `json:"builder"`
	Params  map[string]any `json:"params"`
}

// BuildResult is one builder's output (node-level or scene-level), or validation errors.
type BuildResult struct {
	OK        bool              `json:"ok"`
	Node      json.RawMessage   `json:"node,omitempty"`
	SceneSpec json.RawMessage   `json:"sceneSpec,omitempty"`
	BBox      *BBox             `json:"bbox,omitempty"`
	Errors    []ValidationError `json:"errors,omitempty"`
}

// BBox is a built node's local extents (for auto-layout).
type BBox struct {
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// AssembleRequest assembles placements into one scene.
type AssembleRequest struct {
	Placements []BuilderPlacement `json:"placements"`
	Beat       SceneBeat          `json:"beat"`
	Theme      string             `json:"theme"`
	Palette    Palette            `json:"palette"`
	Canvas     Canvas             `json:"canvas"`
	Seed       int64              `json:"seed"`
}

// AssembleResult is the assembled scene spec (opaque) + its content hash, or errors.
type AssembleResult struct {
	OK          bool              `json:"ok"`
	Spec        json.RawMessage   `json:"spec,omitempty"`
	SpecHash    string            `json:"specHash,omitempty"`
	DurationSec float64           `json:"durationSec,omitempty"`
	Errors      []ValidationError `json:"errors,omitempty"`
}

// RenderRequest renders an opaque spec.
type RenderRequest struct {
	Spec    json.RawMessage `json:"spec"`
	Options map[string]any  `json:"options,omitempty"`
}

// RenderResult is the stored clip + dimensions; Cached reports an engine cache hit.
type RenderResult struct {
	Video       ObjectRef `json:"video"`
	DurationSec float64   `json:"durationSec"`
	Width       int       `json:"width"`
	Height      int       `json:"height"`
	FPS         int       `json:"fps"`
	Cached      bool      `json:"cached"`
}

// ValidationError mirrors the engine validator's structured error.
type ValidationError struct {
	Path    string `json:"path"`
	Code    string `json:"code"`
	Message string `json:"message"`
}
