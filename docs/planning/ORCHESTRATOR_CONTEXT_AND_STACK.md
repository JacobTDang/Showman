<!-- Companion to ORCHESTRATOR_DESIGN.md. Locks the stack (Go + Eino) and the
context-management / central-typed-store model. Where the two docs differ, THIS doc wins
(see §1 amendments). -->

# Orchestrator — Stack & Context-Management Spec

Companion to `ORCHESTRATOR_DESIGN.md`. That doc designed the pipeline assuming a
TypeScript orchestrator that imports the builders in-process. We've since chosen **Go +
[Eino](https://github.com/cloudwego/eino)** for the orchestrator. Go can't import the TS
builders, so the catalog and scene assembly move **engine-side**, and the orchestrator
becomes a pure, strongly-typed orchestration brain with a central checkpointed state
store. This doc specifies that, and the context-management model (the priority).

---

## 1. Decisions (this round) + amendments to ORCHESTRATOR_DESIGN.md

| # | Topic | New decision | Supersedes |
|---|---|---|---|
| S1 | Orchestrator language | **Go + Eino** (typed graph state + checkpoint/resume first-class) | the TS assumption throughout |
| S2 | Builder catalog location | **TS, engine-side, exposed over HTTP** (`/catalog`); Go selector calls it | §4 `src/orchestrator/catalog/` in the orchestrator |
| S3 | Scene Assembler | **Deterministic, moves INTO the TS engine** as `POST /assemble` (placements → validated SceneSpec). Lives where builders + validator + `autoRepair` already are | §2.4 (assembler in the orchestrator) |
| S4 | SceneSpec on the Go side | **Opaque** — a content-hashed JSON blob the orchestrator ships to `/render`, never a Go struct tree | implicit TS-struct reuse |
| S5 | `autoRepair`/`jsonRepair`/`describeSceneCompact` | Stay TS, run **engine-side** inside `/build` and `/assemble`; not reimplemented in Go | §9 "reused in-process" |
| S6 | Central state + resume | **Eino graph state + checkpoint** with **typed deltas + reducers**; schema-versioned | §3 hand-built JobStore persistence |
| S7 | FFmpeg concat | Stays orchestrator-side — **Go shells out to ffmpeg** | §5 (unchanged in spirit; now Go) |

**Engine-purity note.** We *add* deterministic authoring endpoints (`/catalog`, `/build`,
`/assemble`) to the existing TS engine service. The byte-deterministic **render core is
untouched** — these are pure functions of their inputs. (They can be split into a separate
TS "authoring" service later; folded into the engine worker for now to avoid a 3rd
container.)

---

## 2. Service topology & the seam

```
┌──────────── ORCHESTRATOR (Go + Eino, new container, has ffmpeg) ────────────┐
│  Eino graph:  plan ─▶ (fan-out) select ─▶ assemble* ─▶ render* ─▶ stitch     │
│  Central state: *JobContext  (graph local state, checkpointed)              │
│  Deltas+reducers via StatePre/PostHandlers · job API · webhook · concat     │
└───────┬──────────────────────────────────────────────────────────┬─────────┘
        │ HTTP (JSON; seam = JSON-Schema + opaque SceneSpec blobs)   │
        ▼                                                            ▼
┌──────────── TS ENGINE + AUTHORING SERVICE (existing container) ─────────────┐
│  NEW (deterministic):  GET /catalog · POST /build · POST /assemble          │
│  EXISTING (untouched): POST /validate · /preview · /render · GET /objects   │
│  imports: builders (math/chem/physics/…), validator, autoRepair, Zod        │
└─────────────────────────────────────────────────────────────────────────────┘
```

`*assemble` and `*render` are HTTP calls into the engine. The **seam is two things only**:
the **catalog JSON-Schemas** (so Go validates selector output before calling `/build`) and
**opaque SceneSpec blobs** (built engine-side, hashed, shipped back for render). The Go
side never owns the SceneSpec node-tree types — that duplication is exactly what we avoid.

### New engine endpoints

```jsonc
// GET /catalog?domain=math            → tool descriptors (name, domain, level, description, keywords, jsonSchema)
// GET /catalog/digest?domain=math     → token-frugal text digest (the describeCatalogCompact output)
// POST /build   { builder, params }   → { ok, node?, sceneSpec?, bbox? } | { ok:false, errors }   (validates+clamps params)
// POST /assemble{ placements, frame } → { ok, spec, specHash, durationSec } | { ok:false, errors } (layout+animate+validate+autoRepair)
```

`/assemble` is where the deterministic Scene Assembler (§2.4 of the design) actually runs —
in TS, returning one validated, repaired `SceneSpec` plus its content hash. The orchestrator
holds only `{ specHash, specBlob }` and passes it to `/render`.

---

## 3. The central typed store — `JobContext`

One Go struct = the complete, durable, strongly-typed state of a job, and the **Eino graph
local state** (`S = *JobContext`). Every field typed; no `map[string]any` except the two
deliberately-open seams (builder `params`, opaque spec blob). Persisted/checkpointed after
every node.

```go
package orchestrator

type JobPhase string
const (
    PhaseQueued     JobPhase = "queued"
    PhasePlanning   JobPhase = "planning"
    PhaseSelecting  JobPhase = "selecting"
    PhaseAssembling JobPhase = "assembling"
    PhaseRendering  JobPhase = "rendering"
    PhaseStitching  JobPhase = "stitching"   // single name; concat+mux
    PhaseDone       JobPhase = "done"
    PhaseError      JobPhase = "error"
)

// THE store. Also the Eino graph local state. SchemaVersion gates checkpoint migration.
type JobContext struct {
    JobID         string          `json:"jobId"`
    Request       ExternalRequest `json:"request"`        // {topic, query, options} — frozen
    RequestHash   string          `json:"requestHash"`    // sha256(canonical(request)) — dedup
    RootSeed      int64           `json:"rootSeed"`        // int(sha256(requestHash)) — determinism root
    SchemaVersion int             `json:"schemaVersion"`   // STORE schema, not engine specVersion
    CreatedAt     time.Time       `json:"createdAt"`
    UpdatedAt     time.Time       `json:"updatedAt"`

    Phase      JobPhase         `json:"phase"`
    Plan       *LessonPlan      `json:"plan,omitempty"`
    Continuity ContinuityState  `json:"continuity"`
    Budget     TimeBudget       `json:"budget"`
    Scenes     []SceneState     `json:"scenes"`
    Final      *FinalAssembly   `json:"final,omitempty"`

    History  []NodeRunRecord `json:"history"`   // APPEND-ONLY audit (model, tokens, attempts, outcome)
    Warnings []string        `json:"warnings"`
    Error    *JobError       `json:"error,omitempty"`
}

type SceneState struct {
    Index      int               `json:"index"`
    Beat       SceneBeat         `json:"beat"`
    Placements []BuilderPlacement `json:"placements,omitempty"` // selector output
    SpecHash   string            `json:"specHash,omitempty"`    // /assemble result id
    SpecBlob   json.RawMessage   `json:"-"`                      // opaque; stored out-of-line (§7)
    Narration  SceneNarration    `json:"narration"`
    Render     *SceneRender      `json:"render,omitempty"`
    Outcome    SceneOutcome      `json:"outcome"`
    Attempts   int               `json:"attempts"`
}

// Only cross-scene shared context. Minimal + append-only (per Decision #13 of the design).
type ContinuityState struct {
    Theme   string       `json:"theme"`
    Palette Palette      `json:"palette"`
    Canvas  Canvas       `json:"canvas"`   // ONE canvas for all scenes (enables -c copy concat)
    Recap   []RecapEntry `json:"recap"`    // one per completed scene, ordered
}
```

`LessonPlan`, `SceneBeat`, `BuilderPlacement`, `TimeBudget`, `SceneOutcome` are the Go
mirrors of the design-doc §2 interfaces — same fields, Go types.

---

## 4. Context ≠ Store: typed views (the core of context management)

The store is large (plan + every scene + history + recap). **No LLM node ever receives the
whole store.** Each node gets a small, strongly-typed **projection** built by a pure
function. This is the discipline that keeps the 120B model's context tight and the prompts
cheap.

```go
// Built from JobContext for the planner — no scenes yet.
type PlannerView struct {
    Request        ExternalRequest `json:"request"`
    DefaultBudget  int             `json:"defaultBudgetSec"`
    CatalogDomains []Domain        `json:"catalogDomains"`
}

// Built per beat for the selector — ONLY what it needs to pick + parameterize builders.
type SelectorView struct {
    Beat          SceneBeat    `json:"beat"`
    CatalogDigest string       `json:"catalogDigest"` // compact, domain-filtered (from GET /catalog/digest)
    RecapTail     []RecapEntry `json:"recapTail"`     // last 1–2 only
    Theme         string       `json:"theme"`
}

// Deterministic assembler input (no LLM) — shipped to engine POST /assemble.
type AssemblerInput struct {
    Placements []BuilderPlacement `json:"placements"`
    Beat       SceneBeat          `json:"beat"`
    Theme      string             `json:"theme"`
    Palette    Palette            `json:"palette"`
    Canvas     Canvas             `json:"canvas"`
    PrevRecap  *RecapEntry        `json:"prevRecap,omitempty"`
}

func planView(s *JobContext) PlannerView      { /* pure projection */ }
func selectView(s *JobContext, i int) SelectorView { /* pure projection */ }
func asmInput(s *JobContext, i int) AssemblerInput { /* pure projection */ }
```

Rule: **a view never carries a field a node doesn't use.** Adding a field to a view is a
deliberate, reviewable change — that's how context stays managed instead of sprawling.

---

## 5. Typed deltas + reducers (chosen write discipline)

Nodes never mutate the store. Each emits a typed **Delta**; the Director (single writer)
folds it in via a reducer. This gives auditability, single-writer safety, deterministic
resume, and unit-testable reducers.

```go
// A Delta is a serializable, typed mutation intent.
type Delta interface {
    Kind() string
    apply(*JobContext) error   // the reducer; pure w.r.t. the store
}

type PlanProduced  struct { Plan LessonPlan }
type SceneSelected struct { Index int; Placements []BuilderPlacement }
type SceneBuilt    struct { Index int; SpecHash string; SpecBlob json.RawMessage; Recap RecapEntry; Outcome SceneOutcome }
type SceneRendered struct { Index int; Clip ObjectRef; NarrationWav *ObjectRef; DurationSec float64; Cached bool }
type SceneFellBack struct { Index int; Reason string; Outcome SceneOutcome }
type JobFinalized  struct { Final FinalAssembly }
type JobFailed     struct { Err JobError }

// The ONLY writer. Applies, stamps, audits, checkpoints — atomically per delta.
func (d *Director) Apply(ctx context.Context, s *JobContext, delta Delta) error {
    if err := delta.apply(s); err != nil { return err }
    s.UpdatedAt = d.clock.Now()
    s.History = append(s.History, recordOf(delta))   // append-only provenance
    return d.checkpoint.Save(ctx, s)                  // Eino checkpoint
}
```

Example reducer (append-only continuity; never rewrites a past scene):

```go
func (e SceneBuilt) apply(s *JobContext) error {
    sc := &s.Scenes[e.Index]
    sc.SpecHash, sc.SpecBlob, sc.Outcome = e.SpecHash, e.SpecBlob, e.Outcome
    s.Continuity.Recap = append(s.Continuity.Recap, e.Recap)
    return nil
}
```

---

## 6. How it maps onto Eino

Eino's graph local state + state handlers ARE the view/reducer mechanism — we don't fight
the framework, we use it as intended ([state docs](https://www.cloudwego.io/docs/eino/),
[checkpoint/interrupt](https://www.cloudwego.io/docs/eino/core_modules/chain_and_graph_orchestration/checkpoint_interrupt/)):

- **Graph local state** = `*JobContext`, created per run (`compose.WithGenLocalState`). This
  is the "central data store with strong typed fields."
- **StatePreHandler** on each node = the **view projection** (`*JobContext → NodeInput`).
  The node receives only its typed view, never the store.
- **node** (ChatModel/ToolsNode/Lambda) = pure-ish; returns a typed output carrying a Delta.
- **StatePostHandler** on each node = the **reducer** (`NodeOutput, *JobContext`): runs the
  Delta's `apply`, appends history. (Or route all deltas through `Director.Apply` for one
  checkpoint path.)
- **Domain Selector** = an Eino **ToolsNode / ReAct-style** node whose tools are the catalog
  entries (names + JSON-Schemas fetched from `GET /catalog`); the model emits tool calls →
  validated → `BuilderPlacement[]`.
- **Per-scene fan-out** = Eino concurrent branch (bounded) — selector→assemble→render per
  scene, each scene an independent sub-flow.
- **Async + resume** = Eino **checkpoint store**; an interrupt after any node persists
  `*JobContext`; resume reloads it. **Schema migration on resume** (Eino supports loading an
  old checkpoint after the state type changed) is why `SchemaVersion` lives in the struct.

> Phase-0 task: confirm exact Eino API signatures (`WithGenLocalState`, `WithStatePreHandler`,
> `WithStatePostHandler`, `ToolsNode`, checkpoint store interface) against the installed
> version and pin it in `control-plane`'s Go module or a new `orchestrator/` module.

---

## 7. Persistence, resume & determinism

- **Storage layout** (reuse the engine's `ObjectStorage`, or the Go gateway's store):
  `contexts/{jobId}.json` (the JobContext, minus blobs) + `contexts/{jobId}/scene-{i}.spec.json`
  (immutable opaque spec blobs, out-of-line so the context doc stays small).
- **Single writer** per job (lease, mirroring the existing coordinator's visibility-timeout
  queue) so multi-replica orchestrators don't double-write.
- **Resume** keys off `Phase` + each `Scenes[i].Render.Status`. An unchanged spec re-sent to
  `/render` is a guaranteed engine cache hit, so retries are near-free.
- **Determinism**: `RootSeed = int(sha256(requestHash))`; `sceneSeed = sha256(rootSeed:index)`
  written into the spec by `/assemble`. Once `scene-{i}.spec.json` exists it's never
  re-derived in that job → the job is fully reproducible after its first pass. LLM nodes use
  low temperature (planner 0.4, selector 0.2) and snapshot `modelId`; a response cache is
  deferred.

---

## 8. Revised Phase 0 / 1 (Go + Eino path)

Supersedes Phases 0–1 of the design doc; later phases shift accordingly. The TS engine work
(catalog/build/assemble endpoints) and the Go orchestrator work proceed as **two parallel
tracks** that meet at the JSON-Schema seam.

**TS track — engine authoring endpoints (no key):**
- T1. Builder tool-catalog in TS (Zod) engine-side: `BuilderTool`, `BuilderRegistry`,
  `describeCatalogCompact`; migrate `math.numberLine` + `chem.reaction` + the 14 `buildMathLesson`
  scene topics. CI: every tool round-trips its `example` through `invoke`.
- T2. `GET /catalog`, `GET /catalog/digest`, `POST /build`, `POST /assemble` (deterministic
  layout+animate+validate+autoRepair). Golden test: fixed placements → byte-stable spec.

**Go track — orchestrator skeleton (no key):**
- G0. New `orchestrator/` Go module; pin Eino; define the locked types (§3–§5): `JobContext`,
  views, `Delta` set + reducers, `EngineClient` (HTTP). Unit-test reducers + a JobContext
  round-trip through the checkpoint store.
- G1. Eino graph wiring with an **offline stub planner + KeywordSelector** (calls
  `GET /catalog` + scores keywords, no LLM) → `/assemble` → `/render` → Go ffmpeg concat →
  one MP4. Proves the whole pipe end-to-end with **zero API key**.

LLM planner + selector (Eino ChatModel/ToolsNode), webhook, fades, and the evals scorecard
follow in later phases — unchanged in intent from the design doc, now on the Go/Eino runtime.

---

## 9. What this buys you

- **One central typed store** (`JobContext`) that is also the Eino graph state — your
  "central data store with strong typed fields," with checkpoint + schema-migrated resume
  for free.
- **Disciplined context**: every LLM call sees a small typed *view*, never the whole store.
- **Auditable writes**: typed deltas + reducers = a replayable history and a clean resume.
- **A hard separation**: Go owns orchestration + typed state; TS owns every spec/pixel
  concern behind HTTP; the seam is JSON-Schema + opaque spec blobs — no type duplication.
