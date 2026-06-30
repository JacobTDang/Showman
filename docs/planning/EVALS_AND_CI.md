# Evals, Testing Framework & Container CI — plan

*What we have, what's missing, and the smallest set of moves to get a real eval loop +
container CI for the brief→MP4 authoring agent. Grounded in the current repo.*

---

## 1. Testing framework — keep Vitest, add an evals layer

**Recommendation: do not add a new framework.** Vitest is already the runner (960 tests,
unit + integration + the cross-OS golden determinism gate). It does everything an eval
harness needs (async, timeouts, fixtures, structured assertions). Adding Jest/Mocha/a
bespoke harness would fragment the suite for no gain.

What's already here:

- `npm test` → `vitest run` (excludes `*.live.test.ts`, so CI needs no key, hits no network).
- `vitest.live.config.ts` → opt-in **live** runner (`test/**/*.live.test.ts`, 200 s timeout)
  for network/LLM tests. `npm run test:live` / `npm run test:kokoro`.
- Golden determinism (`test/golden`) + purity (`test/integration/purity.test.ts`) on a
  Linux+Windows matrix.

The gap is **not** unit testing — it's **quality measurement of the LLM author**: today
the only author coverage is `ScriptedAuthor`/`TemplateAuthor` (deterministic) plus one
gated `openRouterAuthor.live.test.ts`. Nothing scores how often the real GPT-OSS-120B
author produces a valid, renderable, *good* scene from a free-form brief.

## 2. Evals — what to measure and how

Treat an eval as: **a brief suite → run the real author → score structured + qualitative
signals.** Build it on Vitest (`test/evals/*.eval.test.ts`, a third gated config) so it
reuses fixtures and the existing `AuthoringAgent`.

**A frozen brief suite** (`test/evals/briefs.ts`) — ~15–25 briefs spanning the surface:
counting, arithmetic on a number line, a fraction pie, graph y=mx+b, a parabola, a labeled
shape, a bar graph, a chemistry molecule, a physics motion graph, plus a few adversarial /
underspecified ones ("explain photosynthesis to a 5-year-old").

**Per-brief metrics** (cheap, deterministic to assert):

| Signal | Source | Why |
|---|---|---|
| spec validity | `validateScene()` | the core contract |
| attempts to valid | `AuthoringResult.attempts` | self-correction cost |
| **mechanical-repair rate** | `AuthoringAttempt.repaired` | how much Increment 2 saves |
| render success | `RenderService.render` returns a real ftyp MP4 | end-to-end |
| non-blank output | sample a mid frame, assert not all-background | catches "valid but empty" |
| latency / tokens | wall-clock + provider usage | cost on the 120B model |

**Aggregate gates** (the eval *passes* if): validity ≥ N%, render success ≥ N%, p50
latency under budget. Emit a JSON/markdown scorecard artifact per run so regressions are
visible over time.

**Qualitative (later, optional):** a vision-model or human spot-check on a sampled frame
("does this look like a clear, child-friendly <topic>?"). Out of scope for v1; the
structural metrics above already catch most regressions.

Two tiers so the loop is fast:

- **Offline eval** (no key, runs in normal CI): `TemplateAuthor` over the brief suite →
  pure structural assertions. Guards the *pipeline* (parse→build→validate→render) for free.
- **Live eval** (needs the key, gated): the real `OpenRouterSpecAuthor` → the full
  scorecard. This is what the GH secret unlocks.

## 3. Container CI — build is covered, *running* it is not

Current `images` job runs `docker build` for the worker + gateway. It proves they
**build**, not that the worker **serves**. We already have `scripts/smoke-container.sh`
(build → run → POST /v1/generate → assert a real MP4) and the Docker-free
`test/integration/e2eWorker.test.ts`.

Proposed additions:

1. **Run the smoke test in CI** — after the image builds, `docker run` it and hit
   `/v1/generate`, asserting an MP4 (the script already does this; CI just needs to invoke
   it). Turns "it compiles" into "it serves." Uses the offline author → no key needed.
2. **(main only) push to GHCR** — tag + push `ghcr.io/jacobtdang/showman` on merges to
   `main` so other agents/services can pull a versioned image. Needs `packages: write`.
3. Keep the **ffmpeg snapshot pin** (PR #61) so pushed images are byte-reproducible.

## 4. The GitHub secret (action required by you)

CI can't run live evals without the key, and **I can't set a secret value myself** (handling
API keys is off-limits, and there's no secret in the repo yet — `gh secret list` is empty).
Set it yourself from the repo root (the `!` prefix runs it in this session):

```
! gh secret set OPENROUTER_API_KEY
```

`gh` will prompt for the value (paste it; it isn't echoed or logged). Then a gated live-eval
job can read `${{ secrets.OPENROUTER_API_KEY }}`. Recommended: also set `ANTHROPIC_API_KEY`
if we want a second author in the comparison.

> Live evals cost tokens and can be flaky (provider latency/outages). Don't gate every PR on
> them — see the cadence decision below.

## 5. Decisions (locked 2026-06-30) & rollout order

Decided with the user; **implementation is deferred** ("plan only for now") — this section
is the agreed spec to execute against when we proceed.

- **Live-eval cadence: manual + nightly.** A `workflow_dispatch` trigger for on-demand runs
  plus a scheduled nightly run. PRs stay fast and free; author-quality regressions surface
  daily. Gated on `OPENROUTER_API_KEY` being present (skips cleanly if unset).
- **Container CI: smoke-run + push to GHCR.** After build, `docker run` the image and assert
  `/v1/generate` returns a real MP4 (no key); then on `main`, tag + push
  `ghcr.io/jacobtdang/showman` (needs `packages: write`, uses the built-in `GITHUB_TOKEN`).
- **Offline eval suite: yes, on Vitest, in normal CI** — but not started yet (plan only).

Execution order when greenlit:

1. **Offline eval suite** (`test/evals/*.eval.test.ts`, no key) + a third gated vitest config
   + a normal-CI job → guards the parse→build→validate→render pipeline for free.
2. **Container smoke-run** step in the `images` job (no key).
3. **GHCR push** on `main` (`packages: write`, `GITHUB_TOKEN`).
4. **You set the secret** (`gh secret set OPENROUTER_API_KEY`) → add the **manual+nightly
   live-eval job** emitting a scorecard artifact.
5. *(Deferred, Ultracode)* design agent **state & context** management.
