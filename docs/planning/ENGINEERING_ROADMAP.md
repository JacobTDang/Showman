# Engineering Roadmap — post-Graph-Perfection

*July 2026. The orchestrator stack is complete and live-proven (all six Graph Perfection
phases merged; two LLM-planned videos generated end-to-end, one with real voice; CI
race-checked and merge-guarded). This plan covers everything that remains, in five
workstreams with PR-sized phases, acceptance criteria, and an explicit dependency map.
The OpenRouter key rotation is deliberately out of scope — every phase here except the
live-eval switch-on is key-independent.*

---

## 0. Current state (what this plan builds on)

- **Engine (TS):** deterministic render service; typed builder catalog (17 tools) +
  `/catalog`, `/build`, `/assemble`; kind-aware motion + timeline narration sync;
  offline quality-bar evals in CI.
- **Orchestrator (Go):** planner→selector→assemble→render→stitch with fallback tiers,
  failure ladder, bounded fan-out (race-checked), scorecard, async job API, and a
  compiled Eino graph with interrupt/resume — **not yet served over HTTP**.
- **Known soft spots:** ~100 builders unwrapped (physics/diagram: zero); both state
  stores are in-memory (restart loses jobs); scene budgets from the LLM are ragged
  (observed 20s/4.8s/30s); container voice falls back to tone (Kokoro not in image).

---

## Workstream A — Catalog breadth *(the biggest lever on output quality)*

**Goal:** the selector can *show* physics, chemistry, richer math, diagrams, and charts —
not just narrate them over cards. Grounded in the actual builder inventory below; every
tool follows the established `BuilderTool` conventions (Zod schema = single source of
truth, `example` round-trips in CI automatically, keywords feed the offline selector,
`bbox` feeds layout).

### A1 — Math node wave + the function-graph macro (~16 tools, 2 PRs)
The most-requested visuals and the layout-friendly building blocks:

| Tool | Wraps | Params sketch | Notes |
|---|---|---|---|
| `math.functionGraph` | `coordinatePlane` + `plotFunction`/`plotLine` | `{kind: "linear"\|"quadratic"\|"points", m?, b?, a?, c?, points?, xRange?, yRange?}` | **Macro tool** — the plane+plot pair composed via the internal handle (`toX`); the headline algebra visual as ONE placement |
| `math.fractionCircle` / `math.fractionBar` | same-named | `{numerator, denominator, size?}` | arc sweep animates via P1 content beats for free |
| `math.tenFrame` | `buildTenFrame` | `{filled, total?}` | counters pop via `fillStagger` semantics |
| `math.arrayGrid` | `buildArrayGrid` | `{rows, cols}` | multiplication |
| `math.balanceScale` | `buildBalanceScale` | `{left, right, tilt?}` | equations |
| `math.mathExpr` | `buildMathExpr` | `{expr: string}` (tokenized: fractions/exponents/operators) | validate token set in the schema `refine` |
| `math.angle` | `buildAngle` | `{degrees, label?}` | |
| `math.barGraph` / `math.pictograph` | same | `{bars: [{label, value}]}` (≤8 bars) | |
| `math.percentRing`, `math.numberSentence`, `math.dotPattern`, `math.baseTenBlocks`, `math.areaGrid`, `math.labeledShape`, `math.numberLineFraction` | same | small typed knobs each | |

*Acceptance:* every tool round-trips its example (automatic); `math.functionGraph`
assembles + draws on (progress tracks present); catalog digest for `math` stays < 900
tokens (measured in a unit test).

### A2 — Physics wave (~12 tools, 2 PRs) *(domain currently has ZERO)*

| Tool | Wraps | Params sketch |
|---|---|---|
| `physics.forceDiagram` | `forceDiagram` | `{forces: [{label, angleDeg, magnitude}], body?}` |
| `physics.projectile` | `projectile` | `{v0, angleDeg, gravity?}` — trajectory polyline draws on |
| `physics.pendulum` / `physics.massSpring` | same | `{length?, amplitude?}` / `{mass?, k?}` (builder-authored oscillation tracks respected by P1) |
| `physics.inclinedPlane` | `inclinedPlane` | `{angleDeg, showForces?}` |
| `physics.energyBars` | `energyBars` | `{bars: [{label, value}]}` |
| `physics.circuit` | `wire`+`battery`+`resistor`+`lamp`+`switchSym`… | **Macro tool**: `{elements: [{kind, label?}], layout: "series"\|"parallel"}` — composes the symbol builders; caps at 6 elements |
| `physics.rayDiagram` / `physics.lens` | same | `{focalLength, objectDistance}` |
| `physics.bohrAtom` | `bohrAtom` | `{element?, shells?}` |
| `physics.vectorField`, `physics.motionGraph`, `physics.emSpectrum`, `physics.energyLevels` | same | small knobs each |

*Acceptance:* a live-style offline run of `{topic: "gravity", query: "show a ball's
trajectory"}` selects `physics.projectile` via keywords; digest < 900 tokens.

### A3 — Chem wave (~10 tools, 1–2 PRs) *(domain currently has ONE)*

| Tool | Wraps | Params sketch |
|---|---|---|
| `chem.molecule` | `moleculeFrom` / `moleculeFromSmiles` | `{name?: enum of moleculeNames, smiles?: string}` — refine: exactly one of name/smiles; SMILES parse errors surface as INVALID_PARAMS |
| `chem.lewisStructure` | `lewisStructure` | `{formula, ligands?}` |
| `chem.phScale` | `phScale` | `{marks: [{label, ph}]}` |
| `chem.energyDiagram` | `energyDiagram` | `{activation, deltaH, catalyzed?}` |
| `chem.titrationCurve` / `chem.heatingCurve` / `chem.phaseDiagram` | same | curve knobs |
| `chem.periodicTable` | `periodicTable` | `{highlight?: string[]}` |
| `chem.vseprShape` / `chem.electronConfig` | same | `{geometry}` / `{element}` |
| `chem.apparatus` | `beaker`/`testTube`/`erlenmeyerFlask`/`bunsenBurner`… | **Macro tool**: `{items: [{kind, fillLevel?, label?}]}` |

### A4 — Diagram + chart wave (~8 tools, 1 PR)
`diagram.flowchart` (`{steps: string[], branches?}`), `diagram.table`
(`{headers, rows}` ≤5×6), `diagram.labeledBox` + `diagram.connector` (node pair),
`chart.bar`/`chart.line`/`chart.area`/`chart.scatter` (`{series, labels}` capped).

### A5 — Selector scaling for a ~60-tool catalog *(gates on A1–A4 landing)*
- **Domain filtering becomes mandatory** in the selector prompt (the digest already
  filters; enforce that a hint-less beat uses the two-stage mode from the design:
  stage 1 picks builders from a name+description-only global digest, stage 2 fills
  params from the picked tools' full schemas).
- **Digest budget test:** unit test asserting each domain digest < 900 tokens and the
  global name-only digest < 700 tokens (fails CI when a wave bloats prompts).
- Keyword selector: tie-break refinement (prefer node-level for multi-placement beats).

---

## Workstream B — Serve the graph *(durability + HITL over HTTP)*

**Goal:** the interrupt/resume machinery becomes reachable, and no job dies with a
process restart.

### B1 — Persistent stores (1 PR)
- `FileCheckpointStore` (JobContext JSON at `SHOWMAN_DATA_DIR/contexts/{jobId}.json`,
  atomic tmp+rename writes) and `FileByteStore` (Eino checkpoints at
  `…/eino/{checkpointId}`). Both selected by env; in-memory remains the test default.
- *Acceptance:* kill -9 the orchestrator mid-job in a test harness; restart; `GET
  /v1/jobs/:id` still answers from disk.

### B2 — Server runs the graph (1 PR)
- `Server` switches `Pipeline.Run` → `GenerateGraph.Run`. On interrupt: persist the
  interrupt ID + the gate `JobView` into the store (`JobContext.Resume{Token, At}` new
  field, schemaVersion → 2 with a checkpoint migration), job status projects as
  **`awaiting-review`** with `resumeUrl`.
- *Acceptance:* `previewGate: true` job over HTTP reaches `awaiting-review` and lists
  per-scene clips in the view.

### B3 — `POST /v1/jobs/:id/resume` (same PR as B2 or its own)
- Body `{}` (approve) for v1; 409 if not awaiting; idempotent on double-post (second
  call finds the job past the gate). Later: `{reselect: [{index, hint}]}`.

### B4 — Crash-resume on boot (1 PR)
- On startup, scan `contexts/` for non-terminal phases; re-invoke the graph with the
  same checkpoint ID. Safe because scene specs are immutable once written and engine
  renders are content-cached (re-running a completed scene is a cache hit).
- *Acceptance:* restart mid-`rendering` in the harness → job completes without
  re-calling the LLM (history shows no new plan/select records).

---

## Workstream C — Quality depth *(observed gaps from the live runs)*

### C1 — Duration smoothing (small, do first — 1 tiny PR)
The water-cycle run budgeted 20s/4.8s/30s. In `normalizePlan` (LLM tier only):
clamp each beat to [5, 20]s, then scale so Σ ≈ `totalDurationBudgetSec` (end-card
excluded, keeps its 4s). The assembler still stretches for real speech, so this is a
*target* smoothing, not a straitjacket.
*Acceptance:* unit test — ragged inputs → max/min ratio ≤ 3; eval suite duration checks
still pass.

### C2 — Grid layout + overlap guard (1 PR)
- `slot: "grid"`: N node-level placements auto-arranged into a centered grid
  (2→side-by-side, 3–4→2×2, 5–6→3×2) using each `bbox`.
- Overlap detection after layout: if any two placement bboxes intersect > 10%, shrink
  the larger by the overlap ratio (deterministic rule) and note it in `repaired`.
- *Acceptance:* eval addition — no two placement bboxes in the suite overlap.

### C3 — One re-plan rung (1 PR)
If ≥1 scene degraded AND the job used the LLM planner, run ONE `revise` pass after
fan-out: the planner gets the failed beats + their errors and may replace just those
beats (`BeatRevised` delta; revised scenes re-run select→assemble→render; bounded to a
single revision per job; offline tiers never revise).
*Acceptance:* harness test — degraded main beat gets revised and succeeds on the second
shape; `history` shows exactly one revision round.

### C4 — Entity reuse (1 PR, after A-waves)
`ContinuityState.Entities: map[key]{Builder, Params}` — the assembler registers each
successful placement under a selector-provided `ref` key; later beats may emit
`{ref: "key", slot: …}` to re-place the identical visual (same builder+params → same
pixels via determinism). Selector prompt documents it; keyword tier ignores it.
*Acceptance:* two-beat test where beat 2 `ref`s beat 1's molecule → identical node
subtree modulo namespace prefix.

### C5 — Vision preview feedback *(deferred — needs a vision-capable model + key)*
Design note only: rung 5½ sends the `/preview` PNG to a vision model ("is anything
overlapping/clipped/illegible?") for free-author or grid scenes. Parked until the key
lands and A/C2 reduce the need.

---

## Workstream D — Evals growth *(key-independent now, live later)*

### D1 — Orchestrator offline e2e eval in CI (1 PR)
A CI step (in the existing orchestrator job) that boots the TS engine (`tsx worker`) +
`go run ./cmd/orchestrator` with **offline tiers**, runs a 6-topic `{topic, query}`
suite through `/v1/generate`, and asserts per-job scorecards: `fallback ≤ 1/scene-count`,
`degradedRate == 0` for in-catalog topics, offsets monotonic, MP4 ftyp. Uploads the
scorecards as a CI artifact. (This is the smoke-eval of the whole binary surface — the
Docker smoke without Docker.)

### D2 — Live eval workflow, pre-wired but dormant (1 PR)
`.github/workflows/live-evals.yml`: `workflow_dispatch` + nightly cron; **first step
checks `secrets.OPENROUTER_API_KEY` and exits neutral if absent** — so the day the
rotated key is set, nightly evals just start. Runs the same suite with LLM tiers,
scores planner coherence (hard: schema validity, scene-count sanity, budget spread
post-C1) and selector correctness vs acceptable-sets, publishes scorecard artifacts.

### D3 — Scorecard trend (fold into D1/D2)
Each run appends a one-line JSON summary to the artifact; no dashboard yet.

---

## Workstream E — Ops polish *(cheap, slot anywhere)*

| Item | Shape | Acceptance |
|---|---|---|
| E1 Webhook | POST terminal `JobView`, HMAC (`SHOWMAN_WEBHOOK_SECRET`), SSRF guard (deny private ranges unless allowlisted), `webhookDeliveredAt` persisted | harness: fired exactly once incl. across restart |
| E2 Fade transitions | `options.transition:"fade"` → xfade+acrossfade re-encode path in the stitcher; output labeled non-cached best-effort | 3-clip fade probe: streams intact, duration ≈ Σ − overlaps |
| E3 GHCR push | on main: build+push `ghcr.io/jacobtdang/showman{,-orchestrator,-gateway}:sha` + `:latest`; `packages: write` via `GITHUB_TOKEN` | images pullable |
| E4 Kokoro image variant | `--build-arg INCLUDE_KOKORO=1` worker image (adds optional deps, ~+500MB) tagged `:kokoro`; compose worker uses it with `SHOWMAN_TTS_PROVIDER=kokoro` | containerized job produces −18dB-ish audio |
| E5 golangci-lint (orchestrator) | mirror the gateway job | CI green |
| E6 Loudness normalization | wire the existing `audio/loudness` pass into the stitcher's mux step | probe: mean −16±2 LUFS |

---

## Sequencing & PR map

```
   C1 duration smoothing (tiny, immediate)
   │
   ├── A1 math wave ─ A2 physics ─ A3 chem ─ A4 diagram/chart ─ A5 selector scaling
   │        (independent of B; ~6 PRs total; each wave ships alone)
   │
   ├── B1 persistent stores ─ B2+B3 graph over HTTP ─ B4 crash-resume
   │        (independent of A; ~3 PRs)
   │
   ├── D1 offline e2e eval (after B2 — it exercises the served surface)
   │        └── D2 dormant live workflow (any time; activates when the key lands)
   │
   ├── C2 grid+overlap (after A1 — needs multi-placement tools to matter)
   ├── C3 re-plan rung (after D1 — measured by degraded-rate)
   ├── C4 entity reuse (after A-waves)
   │
   └── E1–E6 slot into gaps (E4 pairs well with E3)
```

**Suggested order of execution:** C1 → A1 → B1 → A2 → B2+B3 → A3 → D1 → A4+A5 → B4 →
C2 → D2 → C3 → E-items → C4. Roughly 16–18 PR-sized increments, every one CI-green
under the determinism gate and merged via `merge-when-green.sh`.

## Risks & mitigations

1. **Prompt bloat as the catalog grows** → the A5 digest-budget tests fail CI before the
   selector degrades; two-stage selection is the release valve.
2. **Selector confusion across 60 tools** → domain hints stay soft but the planner
   prompt is updated (A5) to *always* emit a `domainHint`; acceptable-set evals (D2)
   quantify regressions when the key lands.
3. **Schema migration for `JobContext.Resume` (B2)** → `schemaVersion` gate exists;
   Eino's `MigrateCheckpointState` covers old checkpoints; a migration unit test is part
   of B2's acceptance.
4. **Macro tools (functionGraph, circuit, apparatus) hide composition bugs** → each
   macro gets a golden spec test, not just the example round-trip.
5. **The mirror flake class** → already contained (labeled fallback + hard caps); GHCR
   (E3) additionally makes prebuilt images available so most CI runs stop rebuilding.

## Explicitly deferred (not forgotten)

- **Key rotation + `gh secret set OPENROUTER_API_KEY`** — user action; flips D2 live.
- **C5 vision preview feedback** — needs key + vision model.
- **Multi-replica orchestrator lease** — single instance is fine until there's traffic.
- **HITL beyond approve** (per-scene reselect payloads) — API shape reserved in B3.
