# Remaining Gaps — Resolution Plans

Four items were left open at the end of the engineering-roadmap + CI-hardening work.
This document plans each to closure, end-to-end (real verification, not "CI is green").
Ordered by scope, smallest first.

---

## 1. `motionGraph` / `vectorField` — arbitrary-function params (self-contained, no external deps)

**Why it's stuck:** both builders take a raw JS closure (`fn: (t) => number`,
`field: (nx, ny) => vector`) as a parameter. Neither a Zod schema nor an LLM's JSON
output can express "a function" — so neither catalog tool can exist as currently
designed.

**Fix: a named-preset layer.** The catalog tool accepts a `preset` enum + a small
`params` record (both JSON-serializable); the tool's `build()` maps preset+params to
a real closure server-side. This is the same shape physics/education software
generally uses (a fixed vocabulary of standard motions/fields), and it's exactly
expressive enough for the curriculum this project targets.

**`physics.motionGraph`** (wraps `motion.ts`'s `motionGraph`, kinematics graphs):
```
series: [{
  label: string,
  preset: "constant-velocity" | "constant-acceleration" | "projectile-height" | "damped-oscillation",
  params: { v0?, a?, x0?, angle?, amplitude?, decay?, omega? },  // preset-dependent, all optional w/ defaults
  color?: string,
}],
tMax: number,
```
Preset → closure mapping (pure math, no ambiguity):
- `constant-velocity`: `t => v0*t + x0`
- `constant-acceleration`: `t => 0.5*a*t*t + v0*t + x0`
- `projectile-height`: `t => v0*sin(angle°)*t - 0.5*9.8*t*t`
- `damped-oscillation`: `t => amplitude*exp(-decay*t)*cos(omega*t)`

**`physics.vectorField`** (wraps `fields.ts`'s `vectorField`):
```
preset: "uniform" | "radial-outward" | "radial-inward" | "dipole" | "vortex",
params: { magnitude?, centerX?, centerY?, falloff?: "none"|"inverse"|"inverse-square" },
```
Preset → closure mapping: uniform (constant vector), radial in/out (unit vector
from/to center, optionally falling off with distance — the E-field/gravity-field
pedagogy case), dipole (two-source superposition), vortex (rotational, perpendicular
to the radius vector).

**Steps:**
1. Write `src/catalog/physics/motionGraph.tool.ts` + `vectorField.tool.ts`, following
   the existing physics-tool file pattern exactly (Zod schema, keywords, `example`,
   `build()`).
2. Register in `register.ts`.
3. Tests: the automatic round-trip (free, via `catalog.test.ts`'s generic loop) plus
   *targeted* numeric tests per preset — e.g. `constant-acceleration` with `a=2,
   v0=0` at `t=2` must equal position `4` exactly (pure arithmetic, no fuzz needed).
4. Add both to the Go `expandedCatalog()` fixture (A5) with representative beat
   text, proving the offline `KeywordSelector` doesn't collide them with existing
   physics keywords (`motion.ts` already has `energyBars`/`projectile`/etc. sharing
   vocabulary like "graph", "energy").
5. Decide per-preset whether the offline selector can reasonably guess a preset from
   free text (e.g. "show velocity vs time for constant acceleration" → obviously
   `constant-acceleration`) — if yes, add it to D1's offline eval topic suite too,
   closing the loop with the same infra that found the *original* selector gaps.

**Effort:** small, one PR, no external dependencies. Fully verifiable locally
(pure functions) before it ever touches CI.

---

## 2. Selector capability gap — `physics.circuit` / `chem.molecule` / `chart.*` unfillable offline

**Why it's stuck:** the offline `KeywordSelector` only ever extracts *scalar*
params via regex (a count, a slope, a fraction). These three tools need
*structured* params a beat's free text can't reliably yield: an ordered element
list, a specific molecule identity, or real category/series data.

**Fix, tool by tool — different answer for each, chosen honestly rather than forcing
one mechanism to fit all three:**

- **`physics.circuit`** — extractable with real confidence. Scan beat text for known
  circuit-vocabulary keywords ("battery", "resistor", "capacitor", "switch", "diode",
  "inductor", "lamp", "AC source", "meter") in the order they appear; build an
  `elements: []` array from whatever's found, in that order. If nothing is found but
  the tool was still selected (matched purely on "circuit"/"wire"), fall back to a
  generic, always-safe default: `[{kind:"battery"}, {kind:"resistor"}]`.
- **`chem.molecule`** — extractable with real confidence, differently: scan beat text
  for any of `moleculeNames()`'s known library entries as literal substrings ("water",
  "benzene", "methane", ...) — reuse the exact same list the Zod enum is built from,
  so it can never drift out of sync. If no library name matches, default to `name:
  "water"` (the one molecule guaranteed to exist and be pedagogically inoffensive) —
  never attempt SMILES synthesis from free text; that's not a solvable regex problem.
- **`chart.bar`/`chart.line`/`chart.area`/`chart.scatter`** — **not** extractable, and
  pretending otherwise (synthesizing fake category/series data) would be actively
  misleading in a rendered video. The honest fix here is *exclusion*, not synthesis:
  add a small denylist in `KeywordSelector` of tool names that require an LLM tier
  to use meaningfully; `pickTool` skips them entirely when running offline, always
  falling through to the next-best candidate (typically `math.dataLesson` /
  `math.barGraph`, which already carry sensible built-in defaults) or the
  `math.countingLesson` catch-all.

**Steps:**
1. `orchestrator/selector.go`: extend `extractParams` for `physics.circuit` and
   `chem.molecule` per above; add an `offlineExcluded` set (`chart.bar`, `chart.line`,
   `chart.area`, `chart.scatter`) that `pickTool` filters out before scoring.
2. Extend `expandedCatalog()` (A5's fixture) + `TestKeywordSelectorScalesAcrossExpandedCatalog`
   with cases proving: circuit/molecule topics now build with sensible non-empty
   params offline; chart topics correctly skip chart.* and land on a safe fallback.
3. **Re-enable** circuits/molecules/charts in D1's offline-eval topic suite (currently
   excluded — this was the original honest scope-cut) — this is the real closure
   signal: the exact eval that found the gap now passes with the gap closed, not a
   new eval invented to claim victory.
4. Verify locally with `go test -tags e2e -run TestOfflineE2EEval` (boots the real
   engine, drives the real offline pipeline) before shipping — same discipline used
   throughout this session.

**Effort:** medium, one PR, fully self-contained in Go + the existing eval infra.
No new external dependencies.

---

## 3. D2 live-LLM eval — dormant until a real key exists

**Why it's stuck:** by design (the roadmap's own acceptance bar: "exits neutral if
absent"). This is not a bug to fix; it's a switch only you can flip, for a reason
this session already hit once — the key pasted in chat earlier was treated as
compromised-by-exposure and never set as a durable secret.

**What only you can do (security boundary — I won't do these even if asked):**
1. Obtain a **fresh** OpenRouter API key (rotate, don't reuse the exposed one).
2. Set it yourself: `gh secret set OPENROUTER_API_KEY --repo JacobTDang/Showman`
   (paste the key when prompted — it never needs to touch this chat).
3. Optionally also set `OPENROUTER_BASE_URL` / `OPENROUTER_MODEL` as secrets if you
   want something other than the default (`openrouter.ai/api/v1`, `openai/gpt-oss-120b`).

**What I do once the secret exists (no code changes needed — this is already wired):**
1. Trigger it once by hand: `gh workflow run live-evals.yml` (don't wait for the
   nightly 17:07 UTC cron the first time).
2. Watch the run, pull the `orchestrator-live-eval-scorecards` artifact, and read
   `eval-live-scorecards.json` for real per-topic results (scene-count sanity,
   duration-spread bound, and — the interesting one — whether the LLM actually landed
   in the "acceptable builder set" for `circuits`/`molecules`/`data`, the exact three
   topics D1 can't cover offline).
3. **Likely first-run friction, and the honest plan for it:** LLM selector output is
   probabilistic. If the model doesn't reliably pick an acceptable builder for a given
   topic, the fix is iterating the *prompt* (`prompts/selector-system.md`'s catalog
   digest phrasing) or loosening/tightening `eval_live_test.go`'s acceptable-sets —
   not the harness itself, which is already correct. Budget 2-3 rounds of "run → read
   scorecard → adjust prompt or expectation → re-run" before calling it stable.
4. Once a clean run exists, this item is genuinely closed — not just "the workflow
   exists," which is all that's true today.

**Effort:** small on my side, requires you for step 1-2, then iterative tuning.

---

## 4. The `scale` compose profile — bigger than it looked

**Important finding while planning this:** I checked before writing this plan.
`docker-compose.yml`'s `scale` profile brings up real Redis/Postgres/MinIO
*containers*, but **nothing in the TypeScript codebase talks to any of them** —
`package.json` has zero Redis/Postgres/MinIO/S3 client libraries, and
`src/distributed/queue.ts`/`src/service/jobs.ts`/`src/service/storage.ts` only
implement the in-memory versions (`InMemoryLeaseQueue`, `InMemoryJobStore`,
`LocalObjectStorage`). The profile's own doc comment ("swapping the in-memory
Queue/JobStore/LocalObjectStorage for their adapters lets many standalone workers
pull from a shared queue") describes an *intended* architecture whose adapters were
never written. This isn't "write a CI test for the scale profile" — it's "build the
scale-out feature first," a materially bigger task. Flagging this now so the choice
of depth is yours, not assumed.

**Option A — build it for real (the only way to get a genuine e2e test):**
1. Add `ioredis` (or `redis`) + `pg` + an S3-compatible client (`@aws-sdk/client-s3`,
   MinIO is S3-API-compatible) as real dependencies.
2. Implement `RedisLeaseQueue` (matching the existing `Queue<T>` interface — the
   file's own comment already sketches the shape: BRPOP + a sorted-set for lease
   expiry), `PostgresJobStore` (matching `JobStore`), and `S3ObjectStorage` (matching
   `ObjectStorage`).
3. Wire env-based selection into `coordinatorMain.ts`/`remoteWorkerMain.ts` (mirroring
   the pattern already used for `SHOWMAN_TTS_PROVIDER` env-selection) — e.g.
   `SHOWMAN_QUEUE=redis`, `SHOWMAN_JOBSTORE=postgres`, `SHOWMAN_STORAGE=s3`, falling
   back to in-memory/local when unset (never breaking the existing default path).
4. **Then** build the e2e test: `docker compose --profile scale up -d` the full
   stack, scale `shard-worker` to N replicas, submit a job through the coordinator,
   verify it actually distributes (check Redis for queue activity / Postgres for job
   rows across the run, not just that the final video comes back correct — the
   distribution itself is the thing being tested), fetch the result from MinIO,
   verify a real MP4.
5. Wire as its own workflow (like `live-evals.yml`) — `workflow_dispatch` + maybe
   weekly, not on every PR/push — bringing up 5+ containers per run is real CI cost
   for a secondary, opt-in deployment path.

**Effort:** large. Realistically its own multi-PR arc (roughly: queue adapter → job
store adapter → storage adapter → env wiring → compose e2e test), each independently
testable and shippable, similar in shape to this session's A/B/C/D/E roadmap.

**Option B — a much smaller, honest placeholder:**
Add a CI check that only proves the `scale` profile's infra containers actually come
up healthy (`docker compose --profile scale up -d redis postgres minio` +
`redis-cli ping` / `pg_isready` / MinIO's health endpoint) — catches infra-config
rot (a bad connection string, a broken compose service definition) without claiming
the distributed rendering path works, because today it doesn't exist to test.

**My recommendation:** Option B now (cheap, closes the "does the compose file even
work" question, ships in the time it takes to write it), Option A as a deliberately
separate, later initiative if horizontal scaling is actually on your roadmap —
building a distributed queue/store/storage layer nobody's using yet is exactly the
kind of speculative infrastructure worth waiting on real need for.

---

## Suggested order

1 and 2 are small, self-contained, no external dependencies, and directly close
gaps *this session* created (the deferred physics tools, the deferred D1 topics) —
natural to do next, in either order.

3 needs you to act first (a fresh key + `gh secret set`); tell me once it's set and
I'll drive the rest.

4 is a judgment call: Option B is cheap and I'd default to it; Option A is a real
feature-development initiative that deserves its own explicit go-ahead, not an
assumption.
