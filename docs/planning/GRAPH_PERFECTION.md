# Graph Perfection — the plan for flawless animated output

*PM pass, July 2026. The orchestrator graph (plan → select → assemble → render → stitch)
is functionally complete end-to-end (PRs #67–#74). This plan closes the gap between
"the graph works" and "the graph reliably produces beautiful, narrated, pedagogically-
timed animations." Grounded in a code audit; every gap below cites the actual code.*

---

## 1. Where the graph stands (honest audit)

**What's strong already:**
- End-to-end `{topic, query}` → planned multi-scene MP4, zero-key offline tiers, LLM
  tiers behind fallbacks (Eino v0.9.12), typed store + views + deltas, per-scene
  determinism (seed tree, content hashes, engine render cache), byte-stable stream-copy
  concat, containers for both services, 1,014 engine + 30 orchestrator tests.
- **Scene-level lessons** (`buildMathLesson` topics) are genuinely animated — they were
  built by hand with narration beats and motion. When the selector picks one, output
  quality is good.

**The three load-bearing gaps (verified in code):**

| # | Gap | Evidence | Impact on output |
|---|---|---|---|
| G1 | **Node-level scenes barely animate.** The assembler attaches ONE staggered opacity fade (`assemble.ts:163` → `fadeIn()`), while the engine ships 12+ presets (`popIn`, `springIn`, `drawOn`, `slideIn`, `typewriter`, `stagger`, `hop`, `countUp`, `shadeIn`, `fillStagger`…) that node-level scenes never touch. | `src/catalog/assemble.ts` vs `src/motion/presets.ts`, `src/math/presets.ts` | Any multi-builder scene looks static — things *appear*, nothing *moves, draws, or counts*. This is the single biggest quality gap. |
| G2 | **Narration and animation are not synchronized.** Narration beats are spread evenly across a fixed duration (`narrationTrack()` in `assemble.ts`); animations run on their own fixed 0.5s clock. The planner's `narrationArc` (intro/outro/transitions) is generated **and then dropped on the floor** — nothing renders it. The design's "prev recap → leadIn" is also unused. | `orchestrator/planner.go:72` produces it; no consumer exists | Voice says "now watch the line appear" while the line appeared two seconds ago. Scenes feel disconnected; no through-line between scenes. |
| G3 | **One bad scene kills the whole video.** `pipeline.runScene` errors bubble straight to `JobFailed`; the `SceneFellBack` delta exists but is never used. The design's per-scene ladder (retry → repair → fallback card) is unimplemented on the Go side. | `orchestrator/pipeline.go` (no `SceneFellBack` reference) | A single hallucinated param or transient render error throws away N-1 good scenes. Reliability ceiling stays low no matter how good the LLM is. |

**Second-order gaps:** sequential scene processing (no fan-out); no `mustShow`/`forbid`
enforcement; no LLM re-correct rung (assemble errors never fed back); layout is
slot-only (no grid, no overlap detection); no end-card; audio model unverified under
concat (per-clip engine-muxed audio vs. the design's silent-clip+WAV decision); Eino
graph interrupt/HITL not wired; evals scorecard not built.

## 2. The quality bar — what "flawless" means (measurable)

A generated video passes when:
1. **Motion:** every scene has ≥2 distinct motion kinds (an entrance + a content
   animation: draw-on, count-up, hop, shade, stagger); nothing pops in with a bare fade
   unless chosen deliberately.
2. **Sync:** each narration line's start coincides (±0.25s) with the animation beat it
   describes; scene duration is derived from narration length (words-per-second), not
   guessed.
3. **Narrative:** the video opens with the arc's intro, closes with its outro/end-card,
   and scene N's narration can reference scene N-1's takeaway.
4. **Reliability:** a job with one failed scene still ships a video (degraded scene =
   neutral card + warning); job-level failure only when planning fails or ALL scenes
   degrade. Degraded-scene rate is measured.
5. **Determinism preserved:** all new motion uses golden-safe primitives (transform/
   opacity/progress/value tracks — no blurs, no large soft gradients); same request →
   same bytes still holds.

## 3. The plan — six phases, PR-sized, in impact order

### P1 — Motion engine in the assembler *(biggest visible win; engine-side, TS)*
Make node-level scenes move like the hand-built lessons do.
- **Kind-aware entrances:** the assembler picks presets by what a builder returned —
  `drawOn` (progress) for polyline/path-dominant nodes, `countUp` for counters,
  `popIn` (scale+opacity, easeOutBack) as the default, `slideIn` for captions/titles,
  `typewriter` for title text. Reuse `src/motion/presets.ts` + `src/math/presets.ts`
  verbatim — they are already golden-safe and tested.
- **`animate` hint on `AssemblePlacement`** (`"auto" | preset name | "none"`): the
  selector (LLM or keyword) may request a specific entrance; `auto` = kind-aware
  default. Schema documented in the catalog digest so the LLM can use it.
- **Content beats:** after entrance, attach one content animation where the builder
  supports it (arc → `shadeIn`, counter → `countUp`, polyline → `drawOn`), staggered
  placement-by-placement.
- **Micro-polish:** gentle idle `pulse` on the focal placement; title `typewriter`;
  every scene ends with 0.5s of rest (no motion) before the cut.
- *Acceptance:* assembler goldens for each preset path; a 3-placement scene shows 3
  distinct entrance kinds; determinism suite stays byte-green on both OSes.

### P2 — Narration-driven timing *(the sync fix; engine-side, TS)*
- **Duration from speech:** estimate each narration line at ~2.6 words/sec (+0.4s gap);
  scene duration = max(speech total, animation end + rest), clamped to the beat budget.
- **Beat alignment:** narration segment *k* starts exactly when placement/content beat
  *k* starts — one shared timeline built first, then both tracks emitted from it.
- **Arc rendering:** `AssembleRequest.beat` gains `leadIn`/`outro` (orchestrator fills
  them from `narrationArc.transitions[beatId]`, prev `RecapEntry.takeaway`, and the
  plan's intro/outro on first/last scenes). The assembler prepends/appends them as
  narration segments.
- *Acceptance:* a scene with 3 narration lines yields 3 aligned animation beats
  (segment.t == beat start ±ε in the spec JSON); arc intro appears in scene 0's
  narration; unit-tested against the spec, no render needed.

### P3 — Resilience: the per-scene ladder *(Go-side; kills G3)*
- **Rungs in `runScene`:** (1) select → on invalid placements, one **LLM re-correct**
  with the assemble/validation errors in the prompt → (2) keyword tier → (3) **fallback
  card** (a `text`-only neutral scene assembled from the beat title + key points —
  always valid) → emit `SceneFellBack` + warning instead of failing the job.
- **`mustShow`/`forbid` checks** on placements post-selection (string match against
  builder names/params); violation = retryable selection failure.
- **Bounded fan-out:** `errgroup` with `SHOWMAN_SCENE_CONCURRENCY` (default 3) over
  scenes; deltas already serialize through the single-writer Director — add a mutex in
  `Apply` so concurrent scenes can't interleave reducer+checkpoint.
- **Job fails only** when planning fails or every scene degraded.
- *Acceptance:* test — 3-scene job where scene 1's selector always hallucinates →
  video still completes, scene 1 is a card, `outcome.degraded=true`, warnings recorded;
  fan-out test proves deltas serialize.

### P4 — AV correctness & polish
- **Verify the audio model under concat** (risk item): current clips carry engine-muxed
  per-clip audio; prove `-c copy` concat keeps A/V sync across 3+ narrated clips (add a
  smoke assertion on stream counts + duration drift < 50ms). If drift appears, switch
  to the design's silent-clip + per-scene WAV + single final mux (decision #2) — the
  interfaces already allow it.
- **End-card scene** appended by the planner (outro narration + title on brand
  background) — cheap, makes every video feel finished.
- **Fade transition option** (`options.transition="fade"`): xfade re-encode path,
  explicitly non-cached/best-effort per the determinism rule. Cut stays default.
- *Acceptance:* stitched 3-scene narrated video passes ffprobe stream/duration checks;
  end-card visible in the last clip's spec.

### P5 — The Eino graph proper *(HITL + resume, the framework payoff)*
- Re-express the Director loop as `compose.Graph[ExternalRequest, FinalAssembly]` with
  `WithGenLocalState(*JobContext)`; nodes = existing planner/selector/assemble/render
  functions via `AddLambdaNode` + `StatePre/PostHandler` (the views/deltas already
  match this shape 1:1 — that was the point of the scaffold).
- **Interrupt points:** optional `previewGate` interrupts after assembly with the
  scene's preview PNG reference; `Resume`/`ResumeWithData` continues or re-selects.
  Checkpoint store adapts our `CheckpointStore` to Eino's `CheckPointStore`.
- *Acceptance:* graph run == pipeline run on the same request (same deltas/history);
  an interrupted job resumes from its checkpoint across process restart.

### P6 — Evals & live validation *(needs the API key)*
- The scorecard from `EVALS_AND_CI.md`, now with animation-quality signals: motion-kind
  count per scene, narration/beat alignment error, degraded-scene rate, source
  distribution (builder/LLM/fallback %), duration-vs-budget error.
- Offline tier in normal CI (stub tiers over the brief suite); live tier
  manual+nightly once `OPENROUTER_API_KEY` is set (**still pending the rotated key**).
- *Acceptance:* scorecard artifact produced in CI; thresholds enforced offline.

## 4. Sequencing & effort

P1 → P2 land the visible transformation (both engine-side TS, independent of Go
changes; ~2 PRs each). P3 is the reliability floor (Go, 1–2 PRs). P4 verifies a real
risk cheaply. P5 is architectural payoff, not user-visible — schedule after quality.
P6 closes the loop. Each phase ships CI-green under the existing determinism gate;
nothing waits on the API key except P6's live tier.

## 5. Decisions taken in this plan (flag if you disagree)

1. **Kind-aware auto-animation with an LLM-overridable `animate` hint** — not pure-LLM
   animation authoring (token-expensive, breaks determinism envelope) and not
   hardcoded-only (selector loses expressiveness).
2. **Timeline-first assembly** — build one shared beat timeline, emit narration + tracks
   from it (rather than retro-fitting narration onto animations).
3. **Fallback card is text-only** — deliberately humble; never pretends to teach what
   the failed scene would have.
4. **Audio: verify-then-decide** — don't preemptively rebuild the audio path; measure
   drift first, switch to silent+WAV only if the evidence demands it.
5. **Eino graph after quality** — the framework rewire buys HITL/resume, not pixels;
   pixels first.
