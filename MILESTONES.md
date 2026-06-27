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

## M4 — Agent-native interface (MCP) + authoring loop

- [ ] **M4.1 — MCP adapter** — get-schema, validate, preview, submit, status, result.
- [ ] **M4.2 — Self-describing schema tool** — agent authors valid scenes from schema alone.
- [ ] **M4.3 — Authoring agent loop** — brief → plan → emit → validate → preview → self-correct → submit.

## M5 — Beautiful + learning-grade  *(the reason the project exists)*

- [ ] **M5.1 — Storytelling primitives** — characters, scenes, entrance/exit, transitions, camera, text reveals, learning visuals.
- [ ] **M5.2 — Motion-design system** — curated easing/preset library (stagger, anticipation, follow-through).
- [ ] **M5.3 — Child-friendly theming** — warm palette + font theme tokens per lesson.
- [ ] **M5.4 — Narration & audio** — TTS; narration track timed to beats; synced mux.
- [ ] **M5.5 — Captions/subtitles** — accessibility + literacy.
- [ ] **M5.6 — Pedagogical templates** — intro → concept → example → recap (segmentation, signaling, dual coding).
- [ ] **M5.7 — Content-safety gate** — moderation + review/approval before publish. **Release blocker.**

## M6 — Production hardening + delivery

- [ ] **M6.1 — Auth + quotas + spec bounds** — keys, user auth, per-user quotas, max res/duration/frames at validation.
- [ ] **M6.2 — Observability** — queue depth, per-frame time, worker utilization, shard failure rate; logs/traces.
- [ ] **M6.3 — CDN delivery** — CDN over object storage; HLS for long videos.
- [ ] **M6.4 — Kubernetes orchestration** — Deployments, autoscale on queue depth, dead-letter queue, CI/CD, secrets.

---

### Build order
Critical path **M0 → M1 → M2 → M3**, then M4, then M5, harden in M6. Optional:
pull a thin slice of M5 (theming + one storytelling primitive) forward as an
"M2.5 vertical slice" to produce one genuinely cute clip early and de-risk the
beauty goal.
