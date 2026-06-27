# Showman

An animation engine for **beautiful, narrated, pedagogically-structured learning
videos for children** — authored by AI agents. A teacher or an agent provides a
brief ("teach counting to five with stars"); Showman produces a polished, warm,
narrated, captioned animation a child can watch.

All milestones **M0–M6** are implemented. See [MILESTONES.md](./MILESTONES.md) for
the breakdown and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the vision.

![A counting lesson frame](docs/lesson-frame.png)

## Architecture

```
            ┌──────────────── Control plane (Go) ───────────────┐
 agents ──▶ │  Gateway: capability API + auth/quota/bounds      │
 web app ─▶ │           + /metrics + CDN redirect               │
            └───────────────────────────────────────────────────┘
                   │                         │
            worker (TS)               coordinator (TS)
       validate/preview/schema     shard → queue → fan-in assemble
       /render (+ narration,       work-stealing shard workers (TS)
        captions, safety gate)            │
                   └──────── object storage (local / S3) ───────┘
```

- **TypeScript** owns the deterministic engine, render worker, distributed
  coordinator/workers/assembler, and the MCP adapter.
- **Go** owns the edge gateway (capability API + policy + observability).
- Everything speaks the **Scene Spec (JSON)**; languages meet only at JSON seams.

## What's here

| Milestone | What |
|---|---|
| **M0** | Scene Spec contract, structured validator, deterministic `(spec, frame) → pixels` renderer (Skia, pinned fonts, seeded RNG). |
| **M1** | Multi-core frame pool, `spec → mp4` via FFmpeg pipe, HTTP capability worker, Docker image. |
| **M2** | Streaming (fragmented mp4) + async jobs (submit → poll → result). |
| **M3** | Distributed rendering: Go gateway, sharded fan-out, work-stealing pull, fan-in assembler, **idempotent retry** (a sharded render is byte-identical to a monolithic one). |
| **M4** | MCP server (agent tools) + self-correcting authoring loop. |
| **M5** | Storytelling primitives, motion presets, themes, narration/TTS, captions, lesson templates, content-safety gate. |
| **M6** | Auth/quota/bounds, Prometheus metrics, CDN + HLS, Kubernetes manifests, CI. |

## Quickstart

```bash
npm install
npm test              # 173 tests (unit + integration + golden + purity)
npm run demo:lesson   # render a narrated, captioned counting lesson -> out/

# Author a lesson programmatically
node -e "import('./dist/index.js')" # after `npm run build`
```

```ts
import { buildCountingLesson, RenderService, LocalObjectStorage,
         SilentTtsProvider, RuleBasedModeration } from "showman";

const lesson = buildCountingLesson({ count: 5, topic: "stars", theme: "sunshine", itemShape: "star" });
const storage = new LocalObjectStorage("data/objects");
const service = new RenderService({ storage, workDir: "data/tmp",
  tts: new SilentTtsProvider(), moderation: new RuleBasedModeration() });
const result = await service.render(lesson);   // { video, captions, hasAudio, ... } or { blocked } if unsafe
```

## Run the services

```bash
npm run build
npm run worker        # render worker        :8080  (/validate /preview /render /jobs /objects)
npm run coordinator   # sharding coordinator :8090  (/jobs /metrics)
npm run mcp           # MCP server over stdio (agent tools)

# Local cluster (needs Docker daemon)
docker compose up --build
curl -X POST localhost:8080/v1/jobs -d '{"spec": ...}'
```

## Agent interface (MCP)

The MCP server exposes `showman_get_schema`, `showman_validate_scene`,
`showman_preview_scene`, `showman_submit_render`, `showman_job_status`. An agent
reads the schema, authors a scene, previews a frame, self-corrects against
structured validation errors, and submits — see `src/authoring/agent.ts`.

## Key design decisions

| Decision | Choice | Why |
|---|---|---|
| Render backend | `@napi-rs/canvas` (Skia) | deterministic, no system deps |
| Keyframe time | seconds (not frames) | fps-independent; syncs narration |
| Determinism | seeded RNG only, pinned fonts, bitexact encode | safe parallelism + retry + caching |
| Control plane | Go gateway, TS coordinator/workers | JSON seams; pragmatic + tested |
| Storage / queue / jobs | interfaces (local/in-memory now) | Redis/Postgres/S3 adapters for scale |

## Develop

```bash
npm run typecheck                 # tsc --noEmit
npm run golden:update             # regenerate golden frames after an intentional change
cd control-plane && go test ./... # gateway tests
```

Determinism is enforced by tests: render-twice byte-equality, a golden-frame suite,
an engine **purity** scan (no clock / `Math.random`), and a proof that a
**distributed render equals a monolithic render byte-for-byte**.
