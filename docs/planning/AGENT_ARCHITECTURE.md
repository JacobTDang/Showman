# Agent Architecture — Audit & Improvement Plan

*Audit June 2026. Goal: make the authoring agent efficient on a ~120B open model
(GPT-OSS-class), stop hard-coding prompts, containerize for real, and expose a
dead-simple "an agent calls this and gets an MP4" API.*

---

## What already exists (don't rebuild)

- **Authoring pipeline** (`src/authoring/`): `AuthoringAgent.run(brief)` loops
  propose → validate → (preview) → submit, max 3 attempts. Three pluggable authors
  behind a `SpecAuthor` interface:
  1. `OpenRouterSpecAuthor` — **default model already `openai/gpt-oss-120b`**, points at
     any OpenAI-compatible endpoint via `OPENROUTER_BASE_URL` (vLLM/Ollama/LocalAI all work).
  2. `AnthropicSpecAuthor` — Claude Opus 4.8.
  3. `TemplateAuthor` — offline, deterministic (math + counting templates).
- **HTTP service** (`src/service/httpServer.ts`): `/healthz`, `/schema`, `/validate`,
  `/preview`, `/render` (sync), `/render/stream` (pipes MP4 directly), `/author`
  (brief→spec→job, async), `/jobs` + `/jobs/:id` (async queue), `/objects/:key`.
- **MCP server** (`src/mcp/`): 5 tools — `showman_get_schema`, `_validate_scene`,
  `_preview_scene`, `_submit_render`, `_job_status`. DirectBackend (in-proc) or HttpBackend.
- **Render→MP4**: pure `(spec,frame)→pixels` via `@napi-rs/canvas` (prebuilt, no
  cairo/pango), frames piped to **ffmpeg** (x264), optional TTS mux + captions. Caching by
  `sha256(spec+options)`.
- **Containers**: multi-stage `Dockerfile` (node:22-slim + ffmpeg + fontconfig + bundled
  `assets/fonts/`), `docker-compose.yml` (worker/coordinator/shard/gateway), Go gateway on
  distroless. **The worker image already renders an MP4 end-to-end.**

## The real gaps (what to fix)

### A. Prompts are hard-coded → externalize *(your explicit ask)*
- System prompts are inline string literals: `agent.ts:140-145`, `openRouterAuthor.ts:59-66`.
  They even differ subtly ("warm" vs not). Model ids inline (`agent.ts:132`,
  `openRouterAuthor.ts:49`). No few-shot examples anywhere.
- **Fix:** a `prompts/` directory of editable text templates loaded at runtime
  (`author-system.md`, `author-correction.md` with a `{{errors}}` slot,
  `author-examples.md` for few-shot). A `loadPrompts()` resolver with precedence:
  per-call override → `SHOWMAN_PROMPT_DIR` env → bundled default. Bundle `prompts/` into
  the image like `assets/`. Authors read from it instead of inline strings. → tunable,
  versionable, A/B-able, no code change to reword a prompt.

### B. Efficiency on a 120B open model *(your explicit ask)*
- **Schema bloat:** the full 8–15 KB `SchemaDescription` JSON is dumped into the system
  prompt **every call, including each retry** (3–5× token waste). Smaller models also lose
  the signal in the noise.
  - **Fix:** send a **compact schema digest** (node types + their allowed keys + limits,
    no verbose prose/example) by default; keep the full schema available on request. Cache
    the digest (it only changes with `SPEC_VERSION`).
- **No few-shot:** open models follow a schema far better with 1–2 worked brief→spec
  examples. Add them to the prompt pack (B depends on A).
- **No repair loop:** model output goes through a hand-rolled `extractJson()` (fragile:
  trailing commas, arrays, prose, `{"error":...}` all break it) and validation errors are
  stuffed as text for the model to re-fix. **Fix:** robust JSON extraction (tolerant
  parse + common-fix repair), and an auto-repair pass for mechanical validator errors
  (clamp out-of-range, fix a typo'd key via the validator's existing Levenshtein
  suggestions) before spending another LLM round-trip.
- **Schema in `AuthorContext` every call** — move to author-construction-time field.

### C. The "simple tool" gap *(your headline ask)*
- No single atomic "brief → MP4" call. An agent must orchestrate get-schema → author →
  validate → preview → submit → poll → fetch (5–7 steps), or call `/author` then poll a job.
- **Fix:**
  - **HTTP:** `POST /v1/generate { brief, options? }` → renders synchronously and **returns
    the MP4** (stream the bytes, or `{ videoUrl, durationSec, width, height, fps }`). One call.
  - **MCP:** a `generate_video({ brief, options? })` tool that runs the whole
    author→validate→render internally and returns the MP4 reference/bytes. The agent calls
    one tool and gets a video. (Keep the granular tools for power users.)
  - Reuse the existing `AuthoringAgent` + `RenderService`; this is composition, not new engine.

### D. Containerize for real — verify, don't assume
- Setup looks complete; **prove it**: `docker build` → `docker run` → hit `/v1/generate`
  → get an MP4. Add a `Makefile`/script smoke test. Pin ffmpeg to a specific build (the
  Dockerfile itself flags the rolling-apt risk) for byte-stable encodes. Document the
  minimal env (none required for silent-TTS render; `OPENROUTER_API_KEY` for LLM authoring).

## Plan / order (small, CI-green increments)

1. **Prompt pack + loader** (A) — `prompts/` files + `loadPrompts()`; rewire both LLM
   authors; bundle in Dockerfile; unit tests. *(self-contained, highest-clarity ask)*
2. **Compact schema digest + few-shot + repair loop** (B) — `describeSceneCompact()`,
   wire into the prompt pack, tolerant JSON + mechanical auto-repair; tests measuring the
   token reduction.
3. **Atomic `generate` API + MCP tool** (C) — one HTTP endpoint + one MCP tool over the
   existing agent/service; integration test (brief → mp4 bytes).
4. **Container smoke test + ffmpeg pin + docs** (D) — build, run, render, assert a real
   MP4; README "call it as a tool" section.

Each ships as its own PR, verified green (incl. the cross-OS determinism gate), same
discipline as the visual-depth pass.
