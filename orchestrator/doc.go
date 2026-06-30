// Package orchestrator is the Showman director/orchestrator: a Go service that turns a
// {topic, query} request into a planned, multi-scene video. It drives LLM planning and
// builder selection, then calls the deterministic TypeScript engine over HTTP for scene
// assembly and rendering, and stitches the resulting clips into one video.
//
// This file set is Phase G0 — the strongly-typed core, with no LLM and no Eino yet:
//
//   - JobContext (context.go) — the single, durable, strongly-typed state store. It is
//     also the value that becomes the Eino graph's local state in a later phase.
//   - Context views (views.go) — small, typed projections of the store. Every LLM node
//     receives a view, never the whole store. This is the context-management discipline.
//   - Deltas + reducers (delta.go, director.go) — nodes never mutate the store; they emit
//     typed deltas that the single-writer Director folds in, with append-only history.
//   - EngineClient (engineclient.go) — the contract for the engine's catalog/build/
//     assemble/render HTTP endpoints. The orchestrator treats a built SceneSpec as an
//     opaque, content-hashed blob.
//   - Determinism + persistence (ids.go, checkpoint.go) — request-hash seed derivation
//     and a checkpoint store for async-job resume.
//
// See docs/planning/ORCHESTRATOR_DESIGN.md and ORCHESTRATOR_CONTEXT_AND_STACK.md.
package orchestrator
