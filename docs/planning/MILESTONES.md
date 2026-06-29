# Showman — Milestones

Buildable breakdown of [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md). Each
sub-milestone has a deliverable and a "done test". Check items off as they land.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started

---

## M0 — Spec contract + deterministic engine  ✅ (core complete)

> The foundation. Every "deterministic / retryable / scalable" promise downstream
> is only true if the pure-function property here holds.

- [x] **M0.1 — Scene Spec schema v1** — `src/spec/types.ts`, `src/spec/schema.ts`.
      Scene (w/h/fps/duration/seed/background/`specVersion`) + nodes (rect, ellipse,
      text, group) with base transform props and keyframed tracks. Time in **seconds**.
- [x] **M0.2 — Structured validator** — `src/validator/validate.ts`. Returns
      `{path, nodeId, property, code, message}` with "did you mean…" hints. Never throws.
- [x] **M0.3 — Deterministic renderer core** — `src/engine/render.ts`. Skia-backed
      `(spec, frame) → pixels`. Seeded RNG only; purity enforced by a test.
- [x] **M0.4 — Interpolation + easing** — `src/engine/{interpolate,easing,resolve,color}.ts`.
      Number + color tweens, 15 named easings + cubic-bezier, group transform cascade.
- [x] **M0.5 — Golden-frame determinism harness** — `test/golden/`. Render-twice
      byte-equality + committed golden PNGs + `npm run golden:update`.

**Status:** 116 tests pass (unit + integration + golden + purity + encode). `npm test` is green.
**Reserved seam:** `narration` is in the schema (ignored until M5) so the contract
won't break when audio lands.
**Hardening:** an adversarial multi-agent review (6 lenses → per-finding skeptic
verification) surfaced 19 confirmed issues; all fixed with regression tests —
notably the font-family pinning contract (unregistered families are now rejected,
not silently host-substituted), static engine-named colors that the canvas was
silently ignoring (now normalized), prototype-pollution / loose-hex / empty-rgb in
the color parser, premultiplied-alpha fades, a render exhaustiveness guard, a typed
`ValidationCode` contract, and a pinned-value RNG tripwire.

**Carry-forward TODO (deferred, noted so they aren't forgotten):**
- [ ] Publish a JSON Schema document derived from the registry (needed by M4's
      "get schema" tool). Types + programmatic registry exist; JSON Schema export does not.
- [ ] Cross-machine determinism is only *asserted* single-machine here; M1's container
      pins it for real (fonts already pinned in-repo).

---

## M1 — Single render container (spec → mp4)  ✅

- [x] **M1.1 — Frame pool** — `src/render/framePool.ts`: `worker_threads` pool (cores-1) renders frames in parallel, byte-identical to sequential; encoder uses it in ordered chunks. 20-core machine verified.
- [x] **M1.2 — FFmpeg pipe** — `src/encode/encodeVideo.ts`: engine frames → FFmpeg stdin (no disk hop) → mp4. Deterministic (bitexact) mode byte-identical; ffprobe-verified. `npm run demo`.
- [x] **M1.3 — HTTP surface** — `src/service/`: `GET /healthz /schema`, `POST /validate /preview /render`, `GET /objects/<key>`. Content-addressed → idempotent/cached renders. `RenderService` is the shared capability core.
- [x] **M1.4 — Worker image** — `Dockerfile` (multi-stage: build → slim runtime + ffmpeg + pinned fonts + compiled engine), `.dockerignore`. Worker runs natively (`npm start`); image build needs a running Docker daemon (Docker Desktop was off this session).

## M2 — Streaming + async output  ✅

- [x] **M2.1 — Streaming endpoint** — `POST /render/stream` pipes a fragmented MP4 as frames render (`encodeSceneToStream`); playback can begin before render finishes.
- [x] **M2.2 — Async job lifecycle** — `POST /jobs` → `jobId` (202) → `GET /jobs/:id` → `result.video`. `JobRunner` + pluggable `JobStore` (in-memory now, Postgres in M3).
- [x] **M2.3 — Preview-frame capability** — `POST /preview` → inline PNG (or base64 via `?format=json`).

## M3 — control plane + distributed rendering  ✅

> Implemented with a **Go gateway** at the edge and the coordinator/workers/assembler
> in TypeScript, meeting at JSON seams (the plan's risk note: the JSON boundary keeps
> a Go port non-breaking). Queue + JobStore + storage are interfaces — in-memory/local
> by default, Redis/Postgres/MinIO adapters for scale.

- [x] **M3.1 — JSON message contracts** — `src/distributed/messages.ts`: ShardTask / ShardResult / ProgressEvent.
- [x] **M3.2 — Gateway (Go)** — `control-plane/gateway`: capability API + edge policy (auth, quota, spec bounds); proxies to worker + coordinator. `go test` green (7), builds a static binary. (Also satisfies M6.1.)
- [x] **M3.3 — Coordinator + queue** — `src/distributed/{coordinator,queue,coordinatorService}.ts`: sharding, enqueue, job state, lease-based queue. Postgres/Redis adapters slot behind the interfaces.
- [x] **M3.4 — Worker dequeue mode** — `src/distributed/shardWorker.ts`: work-stealing **pull** from the lease queue; segments (gzipped raw frames) → object storage.
- [x] **M3.5 — Assembler + fan-in barrier** — coordinator waits for *all* shards, then `assembleSegments` concatenates through one FFmpeg pass.
- [x] **M3.6 — Idempotent retry + progress** — lease expiry/nack requeues a dead worker's shard; a retried shard produces **byte-identical** output. **Proven: a sharded render equals a monolithic render byte-for-byte.** Progress events observable; poison shards dead-lettered.

## M4 — Agent-native interface (MCP) + authoring loop  ✅

- [x] **M4.1 — MCP adapter** — `src/mcp/`: MCP server (SDK, stdio) exposing get-schema, validate, preview, submit, status. Backend-agnostic (`DirectBackend` in-process / `HttpBackend` over the gateway). Real protocol round-trip tested via in-memory transport.
- [x] **M4.2 — Self-describing schema tool** — `showman_get_schema` returns `describeScene()` (node types, animatable props, easings, fonts, limits, example) so an agent authors valid scenes with no hardcoded format.
- [x] **M4.3 — Authoring agent loop** — `src/authoring/agent.ts`: brief → propose → validate → preview → **self-correct from structured errors** → submit. Pluggable `SpecAuthor` (`ScriptedAuthor` for tests, `AnthropicSpecAuthor` for real LLM authoring). Self-correction proven by test.

## M5 — Beautiful + learning-grade  ✅ *(the reason the project exists)*

> The demo (`npm run demo:lesson`) renders a warm, narrated, captioned, themed
> counting lesson that passes the safety gate — the "would a parent show this" bar.

- [x] **M5.1 — Storytelling primitives** — `polygon` node (regular n-gon / star / triangle) + typewriter `reveal` on text. Characters/scenes/cameras compose from groups + transforms; entrance/exit/transitions are motion presets.
- [x] **M5.2 — Motion-design system** — `src/motion/presets.ts`: popIn/spinIn/slideIn/fadeIn/out, pulse, typewriter + `stagger`/`mergeTracks`, built on the back/elastic/bounce easings — anticipation & overshoot, not linear tweens.
- [x] **M5.3 — Child-friendly theming** — `src/theme/themes.ts`: warm palettes + pinned display font (added **Fredoka**) as per-lesson tokens (sunshine/ocean/meadow/berry).
- [x] **M5.4 — Narration & audio** — `src/audio/`: pluggable `TtsProvider` (silent default + audible tone; cloud TTS slots in), narration assembled on the fps-synced timeline, muxed to AAC. Verified: output mp4 carries an audio stream ≈ scene length.
- [x] **M5.5 — Captions/subtitles** — WebVTT + SRT generated from the narration timeline (`src/audio/captions.ts`); sidecar emitted alongside the video.
- [x] **M5.6 — Pedagogical templates** — `src/lessons/templates.ts`: `buildCountingLesson` + `buildLessonFromOutline` encode intro→concept→example→recap with segmentation, signaling, dual coding.
- [x] **M5.7 — Content-safety gate** — `src/safety/moderation.ts`: rule-based + pluggable model provider; `moderateScene` scans all text + narration; **render is blocked (422) on unsafe content** unless explicitly bypassed post-approval. Release blocker, on by default in the worker.

## M6 — Production hardening + delivery  ✅

- [x] **M6.1 — Auth + quotas + spec bounds** — Go gateway: API-key auth, per-user quota, spec bounds (max w/h/duration/frames) enforced at the edge before a job is enqueued. `go test` covers each.
- [x] **M6.2 — Observability** — Prometheus `/metrics` on the gateway (requests, auth/quota/bounds rejections, upstream errors, CDN redirects) and the coordinator (queue depth, in-flight, dead-letter, jobs by state). Determinism gives free idempotency for retries; poison shards dead-letter.
- [x] **M6.3 — CDN delivery** — gateway redirects `/v1/objects/<key>` to `SHOWMAN_CDN_BASE_URL` when set; `encodeSceneToHls` produces an HLS playlist + segments for long videos.
- [x] **M6.4 — Kubernetes orchestration** — `k8s/showman.yaml` (gateway/worker/coordinator Deployments + Services, worker HPA, KEDA queue-depth ScaledObject template, config/secret); `.github/workflows/ci.yml` runs TS tests + Go tests + builds both images. *(Needs a cluster + the S3 storage adapter to run for real.)*

---

## Product flow — brief → finished video  ✅

The headline goal from the plan ("an agent submits a brief and receives a URL to a
finished video") is realized end to end and tested offline:

- `src/authoring/templateAuthor.ts` — `TemplateAuthor` parses a plain-English brief
  (count, topic, theme, shape) into a structured lesson with no LLM; `createDefaultAuthor`
  picks `AnthropicSpecAuthor` when `ANTHROPIC_API_KEY` is set.
- `POST /author { brief }` on the worker runs the authoring loop (validate → preview →
  self-correct → submit) and returns a `jobId`; `GET /jobs/{id}` resolves to the video.
- `npm run brief -- "teach counting to four balloons in a magical fairy land"` produces
  a complete berry-themed 4-balloon lesson (rendered to `out/`).

## Horizontal scale — HTTP-pull workers  ✅

True multi-process worker scaling **without Redis**: the coordinator exposes its
queue over HTTP (`/tasks/lease|ack|nack|result`), and standalone shard workers
(`src/distributed/remoteWorkerMain.ts`, via `HttpTaskQueue`) pull tasks, render
segments to shared storage, and report back. Proven by a test where a coordinator
with **zero internal workers** has its job rendered entirely by external pull
workers. `docker compose up --scale shard-worker=8` scales the fleet. (A Redis-backed
`Queue` is the alternative for very large fleets — same interface.)

## Math toolkit — counting → algebra  ✅

> Extends the engine into a beautiful math-animation library, built breadth-first
> with lightweight notation, all the way up to functions/quadratics.

- [x] **Engine primitives** — `arc` + `counter` (fractions, clocks, count-ups) and
      `polyline` (connected points with an animatable draw-on `progress`), the keystone
      that draws axes, function curves, segments, braces, and tape diagrams.
- [x] **Math motion presets** — `src/math/presets.ts`: `drawOn`, `shadeIn`, `countUp`,
      `hop`, `fillStagger`.
- [x] **Composite builders** — `src/math/`: `coordinatePlane` + `plotLine`/`plotFunction`
      (graphs evaluated at build time → points), `numberLine`, `fractionCircle`/`Bar`,
      `tenFrame`, `baseTenBlocks`, `dotPattern`, `arrayGrid`, `numberSentence`, `mathExpr`
      (lightweight `a/b`, `x²`), `balanceScale`, `tapeDiagram`, `barGraph`, `angle`.
- [x] **Narrated lessons** — `src/math/lessons.ts`: graphing, quadratic, addition,
      multiplication, fraction, place-value, equation, data + a `buildMathLesson(topic,…)`
      dispatcher.
- [x] **Author intents** — `src/authoring/mathBrief.ts`: a brief like "graph y = 2x + 1"
      or "show 3/4 as a pie" routes (no LLM) to the right lesson.
- [x] **Verification** — per-builder pixel/validity unit tests, three new CI golden
      frames (math primitives, a graph, a fraction + number line), and
      `npm run math-gallery` (a contact sheet of every builder).

**Status:** 286 tests pass; verify gate green. Built via a 10-way parallel agent
fan-out (one builder per file) then an adversarial edge-case hardening pass.

### Build order
Critical path **M0 → M1 → M2 → M3**, then M4, then M5, harden in M6. Optional:
pull a thin slice of M5 (theming + one storytelling primitive) forward as an
"M2.5 vertical slice" to produce one genuinely cute clip early and de-risk the
beauty goal.
