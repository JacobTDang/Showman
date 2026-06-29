# Implementation Plan — Agent-Driven Animated Learning Videos

**Audience:** Claude Code (the builder). **Author:** PM.
**Format:** designs + implementation guidance + acceptance criteria. No code examples.

---

## 1. Product vision & end goal

Build a system that turns a learning brief into a **beautiful, narrated, animated
video for children** — automatically, authored by an AI agent. A teacher or an agent
provides a topic ("teach counting to ten with a story about a frog"); the system
produces a polished, warm, pedagogically-structured animation a child can watch in a
browser.

Everything below ladders toward that. Early phases build the deterministic, scalable
machinery that makes high-quality video *producible at all*; later phases realize the
beauty and the pedagogy. The end state is not "renders shapes" — it's "produces a
lesson a parent would happily put in front of their kid."

---

## 2. What "done" looks like (success criteria)

- An agent submits a brief and receives, asynchronously, a URL to a finished video.
- The video is **visually beautiful** (warm theming, professional motion, readable
  type), **narrated** (synced TTS + captions), and **pedagogically structured**
  (intro → concept → example → recap).
- Rendering is **deterministic** (same input → same output) and **horizontally
  scalable** (throughput grows by adding worker containers).
- The whole thing is **agent-native**: discoverable schema, structured validation,
  cheap previews, references (not bytes) for output.
- It runs as containers, locally via compose and at scale via Kubernetes.

---

## 3. Architecture snapshot (decided)

```
            ┌──────────────── Control plane (Go) ────────────────┐
 agents ──▶ │  Gateway (capability API + MCP adapter)            │
 web app ─▶ │  Coordinator (shards jobs)  ·  Assembler (encode)  │
            └────────────────────────────────────────────────────┘
                  │              │                 │
               Postgres        Redis         Object storage ──▶ CDN
              (job/scene       (queue +       (segments + final
               state)         progress)        video out)
                                 │
                     Render workers ×N  (TypeScript engine, stateless)
```

- **TypeScript** owns the engine, the render worker, and the MCP adapter (best 2D/text
  rendering via Skia-backed canvas; best MCP/agent ecosystem).
- **Go** owns the gateway, coordinator, assembler, and all I/O-and-concurrency
  service work.
- **The Scene Spec (JSON)** is the universal contract: agent → gateway → coordinator →
  workers all speak it.
- Languages meet **only at JSON seams** — no shared logic, no FFI.

---

## 4. The three engineering pillars (cross-cutting design principles)

These recur in every phase. Each phase's "Definition of done" references them.

### Concurrency
There are **two distinct kinds**, and they live in different places:
- **CPU-bound frame parallelism** (the one that matters for speed). Every frame is an
  independent, deterministic pure function — no shared state, no locks. Exploit this at
  *two levels*: inside a worker, a thread/process pool renders many frames across all
  cores; across the cluster, the coordinator shards a job so many workers render
  different frame ranges simultaneously.
- **I/O concurrency** (the services). Handling many requests and juggling
  queue/DB/storage is just waiting on the network — Go's goroutines own this. Keep it
  at the edges; keep the render core synchronous-plus-pool.
- **Determinism is the concurrency-correctness foundation.** Because a frame is a pure
  function of (spec, frame, seed), a retried or re-run shard produces identical bytes —
  so parallel execution and failure-retry are both safe by construction.
- **Fan-in barrier:** the assembler must wait until *all* shards of a job complete
  before concatenating. Job state tracks shard completion.

### Containerization
- The **render worker is the unit of horizontal scale**: a small, stateless image
  (Node + engine + FFmpeg + **pinned fonts** + pinned engine version). Stateless is
  what makes it cloneable.
- Pin *everything* that affects pixels into the image — fonts especially — because font
  drift between machines is the top cause of "identical" frames differing.
- Local: docker-compose runs the backend + N workers + Redis + Postgres + object
  storage. Production: Kubernetes, workers autoscaled on queue depth.

### Communication
- **JSON at every seam.** HTTP between agents/web and the gateway; a Redis queue
  between coordinator and workers; object storage for blob handoff (segments, final
  video); pub/sub for progress.
- **References, not bytes.** Large outputs (video) are handed off by URL/handle through
  object storage. Only small artifacts (a preview frame) ever travel inline. Never push
  a finished video back to an agent as bytes.
- **Async by default for agents.** Submit → poll status → receive URL. A synchronous
  streaming path exists for the web app, not for agents.

---

## 5. Milestone roadmap

| Phase | Objective | Key output | Pillar focus |
|---|---|---|---|
| **M0** | Spec contract + deterministic engine | Validated spec → frame | Communication (the contract) |
| **M1** | Single render container: spec → video file | Containerized "spec in, mp4 out" | Containerization + intra-worker concurrency |
| **M2** | Streaming + async output | Stream + job→URL | Communication + producer/consumer pipeline |
| **M3** | Go control plane + distributed rendering | Sharded fleet render | **Concurrency (fan-out/fan-in)** + comms |
| **M4** | Agent-native interface (MCP) + authoring loop | Agent drives it end to end | Communication (agent contract) |
| **M5** | Beautiful + learning-grade | A lesson a parent would show a kid | The end goal |
| **M6** | Production hardening + delivery | Reliable, observable, at scale | All three, in production |

Sequencing rationale: build a **correct, deterministic core on one machine** (M0–M2)
before distributing (M3); make it **agent-drivable** (M4) before investing in
**polish** (M5); harden last (M6). Distribution multiplies throughput — it does not fix
a broken core.

---

## 6. Phases

### M0 — Spec contract + deterministic engine

**Objective:** lock the contract and prove deterministic single-frame rendering.

**Design.** The Scene Spec is a serializable JSON tree: a scene (dimensions, fps,
duration, seed, background) containing nodes (shapes, text, groups), each with base
properties and keyframed animation tracks (property + keyframes + easing). A separate
shared validator checks any spec and returns *structured* errors (which node, which
property, why) — never a stack trace. The renderer is a pure function:
(spec, frame, seed) → frame image.

**Implementation.** TypeScript; Skia-backed canvas for drawing. Enforce purity: seeded
RNG only, no wall-clock, no global mutable state. Interpolate animated properties
(numbers, colors) across keyframes with easing curves. Groups apply transforms to
children.

**Pillars.** Communication: this *is* the contract everything else speaks. Concurrency:
establish the pure-function property that all parallelism later depends on.

**Definition of done.** Any valid spec renders to a frame; rendering the same frame
twice yields byte-identical output; the validator rejects malformed specs with
actionable, structured messages.

---

### M1 — Single render container: spec → video file

**Objective:** the core component — a stateless container that takes parameters and
outputs a video file.

**Design.** One HTTP endpoint accepts `{ spec, options }` (fps, resolution, format,
seed) and returns a stored video (start with stored mode; a URL/path out). Internals:

```
request {spec, options}
      │
      ▼
  engine ──renders frames (in parallel)──▶ FFmpeg (piped, no disk hop) ──▶ mp4
```

**Implementation.** Node HTTP surface; the engine feeds frames directly into FFmpeg's
input; FFmpeg encodes. Bake FFmpeg, pinned fonts, and the pinned engine version into
the image. The container holds no state between requests.

**Pillars.** Concurrency (first taste): render frames concurrently *inside* the
container using a worker-thread/process pool sized to CPU cores — each frame is
independent, so this is pure data parallelism with no locks. Containerization: this is
the stateless, cloneable worker image. Communication: the `{spec, options} → {result}`
HTTP contract.

**Definition of done.** POST a spec, receive a deterministic mp4; the container runs
standalone; the internal frame pool saturates available cores; output is reproducible
across runs and machines (fonts pinned).

---

### M2 — Streaming + async output

**Objective:** two output modes, split by consumer.

**Design.** (1) *Synchronous stream* — the HTTP response body *is* the video
(fragmented MP4 or HLS over a chunked connection); playback starts before the render
finishes. (2) *Async job* — submit returns a `jobId` immediately; poll status; receive
`resultUrl` when done. Consumer rule: a player/web gets bytes/stream; an agent gets a
reference (jobId + resultUrl) plus, for small things, an inline preview frame.

**Implementation.** Pipe FFmpeg's fragmented output to the streaming response. For the
async path, return a job handle and track progress. Add a `previewFrame` capability
returning a single PNG (the artifact a multimodal agent can actually look at).

**Pillars.** Concurrency: the stream is a producer/consumer pipeline — the engine
produces frames as FFmpeg consumes them, overlapping render and encode. Communication:
the async job lifecycle and references-not-bytes rule are established here.

**Definition of done.** The streaming endpoint begins delivering video before render
completion; the async endpoint returns instantly and later resolves to a URL; previews
return a single frame inline.

---

### M3 — Go control plane + distributed rendering

**Objective:** scale out — many worker containers render one job in parallel.

**Design.** The Go control plane fronts a fleet of M1/M2 worker containers, unchanged.

```
                              ┌─ shard 0 ─▶ worker ─▶ segment 0 ─┐
 submit ─▶ Gateway ─▶ Coordinator ─ shard 1 ─▶ worker ─▶ segment 1 ─┤─▶ Assembler ─▶ video
                          │       └─ shard N ─▶ worker ─▶ segment N ─┘   (barrier:
                       (queue)      (workers PULL from queue)              wait for all)
```

The coordinator splits a job's frame range into shards and enqueues shard tasks on
Redis. Stateless workers **pull** tasks (natural load distribution), render their range,
and write segments to object storage. When all shards report done, the assembler
concatenates segments and muxes audio into the final video. Message contracts (all
JSON): a shard task (jobId, spec reference, frame range, seed, output prefix); a shard
result (jobId, shard id, segment reference, status); a progress event (jobId,
framesDone, state). Job state (Postgres) tracks total vs completed shards.

**Implementation.** Go gateway (capability API: validate, preview, submit, status,
result), Go coordinator (sharding, enqueue, job state, retries), Redis queue, object
storage for segment handoff, Go assembler (FFmpeg concat + audio mux). Workers stay in
TypeScript — they just dequeue instead of taking HTTP directly.

**Pillars.** Concurrency (the headline): inter-container frame-shard parallelism across
the fleet via work-stealing pulls; determinism makes a failed shard safe to retry
idempotently; the assembler is the fan-in barrier. Go goroutines handle the request/IO
concurrency. Containerization: Go backend image + worker fleet + Redis/Postgres/object-
storage containers; docker-compose runs a local multi-worker cluster. Communication:
JSON queue messages, object storage as the blob channel, pub/sub for progress.

**Definition of done.** A single job shards across N workers rendering in parallel;
segments assemble into one correct video; throughput increases by adding workers; a
killed worker's shard is retried and produces identical output; progress is observable
end to end.

---

### M4 — Agent-native interface (MCP) + authoring loop

**Objective:** make the system easy for an agent to call and to drive itself.

**Design.** An MCP server is a *thin adapter* over the gateway's existing capabilities,
exposing them as tools: get the spec schema (self-describing, so the agent can author
valid scenes), validate a scene (structured errors back), preview a scene (inline
frame), submit a render, get job status, get result (URL). Separately, an **authoring
agent** consumes these capabilities in a loop: brief → plan → emit spec → validate →
preview → self-correct → submit. The agent self-corrects against *structured validation*
and *what it sees in a preview frame* before committing to a full render.

**Implementation.** TypeScript MCP adapter over the Go gateway (or the gateway exposes
MCP directly via a sidecar). The authoring agent is a client of the same capabilities —
it is not part of the gateway, and can itself be exposed as a tool so other agents can
trigger it.

**Pillars.** Communication: the agent contract — discoverable schema, structured
validation, inline preview vs URL result, async submit. Concurrency: previews are cheap
and fast, keeping the self-correction loop tight.

**Definition of done.** An external agent, using only MCP tools, can discover the
schema, author and validate a spec, preview it, submit a render, and receive a result
URL — with no human-authored prompt hardcoding the format.

---

### M5 — Beautiful + learning-grade (the end goal)

**Objective:** turn "renders animations" into "produces beautiful lessons children
learn from." This is the phase the whole plan exists for.

**Design.**
- **Expanded primitive library for storytelling:** characters (composed/expressive),
  scenes and backgrounds, entrance/exit animations, scene transitions, simple camera
  moves, text/reading reveals (typewriter, highlight, callouts), and learning visuals
  (counting, number lines, shapes).
- **Motion design polish:** a curated easing + animation-preset library so
  agent-authored motion looks *professionally animated* — staggered entrances,
  anticipation, follow-through — not robotic linear tweens. Warm, child-friendly themes
  (palettes, fonts) selectable per lesson.
- **Narration & audio:** a TTS step produces a narration track; the spec carries
  narration timed to scene beats; the assembler muxes audio synced to the animation.
  Generate **captions/subtitles** (accessibility + literacy support).
- **Pedagogical structure:** lesson templates/segments (intro → concept → example →
  recap) encoding multimedia-learning principles — segmentation, signaling, dual coding
  (visual + narration reinforcing each other).
- **Content safety gate:** moderation of agent-generated text and imagery, plus a
  review/approval step before publish. Non-negotiable for a children's product.

**Implementation.** Extend the engine primitives and the spec schema (new node types,
a narration track, theme tokens). Build the asset pipeline (images, audio, fonts).
Integrate TTS and caption generation. Add the moderation gate ahead of the publish path.

**Pillars.** Concurrency: render audio in parallel with video; prefetch assets.
Communication: assets referenced (not embedded) in the spec; the narration track is part
of the contract. Containerization: assets and voices pinned/baked or fetched from
storage, never bundled per-request.

**Definition of done.** The system produces an end-to-end lesson that is genuinely
beautiful, narrated with synced audio and captions, pedagogically structured, themed for
children, and passes the content-safety gate — the "would a parent show this to their
kid" bar.

---

### M6 — Production hardening + delivery

**Objective:** run reliably, observably, and cost-controlled at scale.

**Design & implementation.**
- **Auth, quotas, cost control:** API keys for agents, user auth for the app, per-user
  render quotas, and spec bounds (max resolution/duration/frame count) enforced at
  validation so a runaway spec can't burn the farm. (Determinism already gives free
  idempotency for retries.)
- **Observability:** metrics that matter for a render farm — queue depth, per-frame
  render time, worker utilization, shard failure rate — plus logs and traces. (Telemetry
  pipelines are familiar territory; lean in.)
- **Delivery:** CDN in front of object storage for finished videos; add HLS/adaptive
  streaming if videos get long.
- **Orchestration:** Kubernetes — backend Deployment, worker Deployment/Indexed Jobs
  autoscaled on queue depth, a dead-letter queue for poison shards, CI/CD building the
  pinned worker image, secrets management.

**Pillars.** Concurrency: autoscale workers on queue depth; K8s job parallelism for
shard fan-out. Containerization: production images, horizontal pod autoscaling, indexed
jobs. Communication: CDN delivery path and the observability pipeline.

**Definition of done.** The system sustains concurrent jobs reliably, autoscales under
load, surfaces farm health on a dashboard, enforces quotas/cost limits, recovers from
worker failure, and delivers finished videos via CDN.

---

## 7. Non-goals (current scope)

- Real-time interactive rendering (a Canvas/WebGL path) — deferred; this is pre-rendered
  video.
- A Rust engine — deferred, but the JSON spec boundary preserves a clean, non-breaking
  port of the hot path later if TS throughput becomes the bottleneck.
- A standalone browser player — optional and separable; the spec can drive one later.
- Multi-tenant billing.

---

## 8. Risks & key decisions

- **Cross-machine pixel determinism.** Floating-point and font rendering can vary by
  hardware. Mitigate: pin fonts + engine version into the worker image; treat the
  cluster as source of truth; if strict parity is needed, pin workers to one
  architecture.
- **TypeScript render throughput at scale.** Native Skia does the heavy lifting, so v1
  is fine; horizontal scaling absorbs growth; the Rust hot-path remains the escape hatch
  behind the JSON boundary.
- **Audio/video sync correctness.** Drive narration timing from the same frame/fps clock
  as the animation; validate sync in M5.
- **Content safety for minors.** Treat the moderation gate as a release blocker, not a
  nice-to-have.
- **Premature distribution.** Do not build M3 before M0–M2 are correct on one machine.

---

## Open decisions to confirm before starting

- Backend specifics: Go web framework + queue library choice.
- `format`: fragmented MP4 (serves streaming + storage cleanly) vs progressive mp4 +
  later HLS.
- Object storage: MinIO for dev → S3-compatible in prod.
- TTS provider for narration.
- Agent framework for the M4 authoring loop: custom vs existing.
