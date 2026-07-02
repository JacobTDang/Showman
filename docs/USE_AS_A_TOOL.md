# Use Showman as a tool (one call → an MP4)

Showman is built so another agent can hand it a plain-English brief and get back a
finished, narrated MP4 — in **one call**, no orchestration. Three ways in.

## 0. The orchestrator — `{topic, query}` → a planned, multi-scene video (async)

The richest entry point: the Go orchestrator plans a lesson (multiple scenes), picks
visual builders from the engine's typed catalog per scene, renders each scene on the
engine, and stitches the clips into one MP4.

```bash
docker compose up worker orchestrator
curl -X POST http://localhost:8091/v1/generate \
  -H 'content-type: application/json' \
  -d '{ "topic": "fractions", "query": "show the fraction 3/4 as a pie" }'
# -> 202 { "jobId": "gen_…", "statusUrl": "/v1/jobs/gen_…" }
curl http://localhost:8091/v1/jobs/gen_…   # poll until "status":"done"
```

With `OPENROUTER_API_KEY` set, an LLM (default `openai/gpt-oss-120b`) plans the lesson
and selects builders; without it, deterministic offline tiers (template plan + keyword
selection) handle everything — the endpoint always works. Planner/selector prompts are
editable files in `prompts/` (`planner-system.md`, `selector-system.md`), overridable at
runtime via `SHOWMAN_PROMPT_DIR`.

> The single-scene `/v1/generate` on the **engine** (below) remains the simplest
> brief→MP4 path; the orchestrator is the multi-scene, planned version of the same idea.

## 1. HTTP — `POST /v1/generate`

```bash
curl -X POST http://localhost:8080/v1/generate \
  -H 'content-type: application/json' \
  -d '{ "brief": "graph y = 2x + 1 and shade the area under it" }'
```

Response (synchronous — it renders before replying):

```json
{
  "videoUrl": "/objects/videos/3f9c…​.mp4",
  "video": { "key": "videos/3f9c…​.mp4", "url": "/objects/videos/3f9c…​.mp4" },
  "durationSec": 8.0, "width": 1280, "height": 720, "fps": 30, "attempts": 1
}
```

Fetch the bytes from `videoUrl` (or `GET /objects/<key>`). Set `SHOWMAN_PUBLIC_URL`
so `videoUrl` is absolute. Optional body field `options` forwards render options
(`{ "deterministic": true, "crf": 18 }`).

> The granular endpoints (`/schema`, `/validate`, `/preview`, `/render`, `/jobs`) are
> still there for callers that want to hand-author a Scene Spec. `/v1/generate` is the
> shortcut that does author → validate → render for you.

## 2. MCP — the `showman_generate_video` tool

An MCP-speaking agent sees one tool that does the whole job:

```json
{ "name": "showman_generate_video",
  "arguments": { "brief": "teach counting to five with stars" } }
```

→ returns `{ ok, videoUrl, durationSec, width, height, fps, attempts }`.

Run the MCP server: `npm run mcp` (in-process backend), or point it at a running
worker with `SHOWMAN_MCP_BACKEND=http SHOWMAN_GATEWAY_URL=http://host:8080`.

## 3. Docker — build, run, prove it

No API keys needed: the offline template author + silent TTS render a valid MP4 with
zero external services.

```bash
docker build -t showman .
docker run -d -p 8080:8080 -v showman-data:/data showman
curl -X POST http://localhost:8080/v1/generate \
  -H 'content-type: application/json' -d '{"brief":"add 2 + 3 on a number line"}'
```

`npm run smoke:container` does all of the above and asserts a real MP4 comes back.

The image pins ffmpeg (and the rest of the apt set) to a frozen Debian snapshot, so the
encoder is byte-for-byte identical on every rebuild — reproducible `deterministic` encodes
and a stable render-cache hash. Move the toolchain forward intentionally by bumping the
build arg: `docker build --build-arg DEBIAN_SNAPSHOT=20260101T000000Z -t showman .`

## Pointing the author at a 120B open model (GPT-OSS-class)

The default LLM author is **`openai/gpt-oss-120b`** via OpenRouter, but it speaks the
plain OpenAI chat API — point it anywhere OpenAI-compatible (vLLM, Ollama, LocalAI):

```bash
OPENROUTER_API_KEY=sk-…           # or a local key
OPENROUTER_BASE_URL=http://localhost:8000/v1
OPENROUTER_MODEL=openai/gpt-oss-120b
```

With no key set, authoring falls back to the deterministic offline template author, so
`/v1/generate` always works.

### Token efficiency on small/open models

By default the author sends a **compact schema digest** (node types, their keys, limits,
fonts, easings — a few hundred tokens) instead of the full ~8–15 KB schema JSON, on every
attempt. It also runs a **mechanical repair pass** before re-prompting: clamping
out-of-range numbers, renaming typo'd keys, and fixing easing names from the validator's
own suggestions — so a fixable mistake costs zero extra LLM round-trips. Set
`SHOWMAN_SCHEMA_MODE=full` to send the complete schema JSON instead (useful for the
largest models, at a token cost).

## Tuning the prompts without a rebuild

The system prompt, few-shot examples, and correction text are editable files in
`prompts/`. Override them per-deployment by pointing `SHOWMAN_PROMPT_DIR` at your own
directory (e.g. a mounted volume) — no code change, no rebuild.
