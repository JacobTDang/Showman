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

## M1 — Single render container (spec → mp4)  🚧 (encoder landed)

- [ ] **M1.1 — Frame pool** — worker-thread/process pool sized to cores. *Done: pool saturates all cores.* (encoder is sequential today)
- [x] **M1.2 — FFmpeg pipe** — `src/encode/encodeVideo.ts`: engine frames → FFmpeg stdin (no disk hop) → mp4. Deterministic (bitexact) mode byte-identical across runs; verified with ffprobe. `npm run demo` renders the counting lesson to `out/lesson.mp4`.
- [ ] **M1.3 — HTTP surface** — `POST {spec, options}` → stored video reference. *Done: POST a spec, get an mp4.*
- [ ] **M1.4 — Worker image** — pinned fonts + FFmpeg + engine version baked in; stateless. *Done: identical mp4 across machines.*

## M2 — Streaming + async output

- [ ] **M2.1 — Streaming endpoint** — fragmented MP4/HLS; playback before render finishes.
- [ ] **M2.2 — Async job lifecycle** — submit → `jobId` → poll → `resultUrl`.
- [ ] **M2.3 — Preview-frame capability** — single inline PNG for a frame.

## M3 — Go control plane + distributed rendering

- [ ] **M3.1 — JSON message contracts** — shard task / shard result / progress event.
- [ ] **M3.2 — Gateway (Go)** — validate, preview, submit, status, result.
- [ ] **M3.3 — Coordinator + Redis queue** — sharding, enqueue, Postgres job state, retries.
- [ ] **M3.4 — Worker dequeue mode** — work-stealing pulls; segments → object storage.
- [ ] **M3.5 — Assembler + fan-in barrier** — wait for all shards, concat + audio mux.
- [ ] **M3.6 — Idempotent retry + progress** — killed shard re-runs to identical bytes.

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
