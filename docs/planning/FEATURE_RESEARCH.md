# Showman — Deep Feature Research

A PM-grade research pass into what to build next, beyond [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md).
Five parallel research threads (animation/rendering, pedagogy/interactivity, AI-native
authoring, delivery/accessibility, competitive) each web-researched the 2025–2026
landscape and grounded against the codebase. The math toolkit and real-voice TTS are
already shipped, so this goes past the existing roadmap.

> Status note: 4 of 5 threads completed with sourced findings; the competitive thread
> was cut off by a usage limit, so that section is a lighter synthesis from prior analysis.

---

## Status — shipped vs. remaining (updated 2026-06-29)

Twelve features have shipped end-to-end since this research, each via a multi-agent adversarial
review with its findings fixed, all CI-green on `main`:

| Shipped | PR | Theme |
|---|---|---|
| SVG `path` primitive + draw-on + shape morphing | #2 | Animation substrate |
| LaTeX-quality math typesetting (MathJax → morphable glyph paths) | #3 | Animation / math flagship |
| Interactive-lesson platform (interaction sidecar + thin player) | #4 | Pedagogy |
| BKT learner model + spaced-retrieval review reel | #5 | Pedagogy / adaptivity |
| xAPI telemetry + teacher mastery dashboard | #6 | Delivery / market |
| Frozen Asset Store + `image` node (content-addressed generate-then-freeze) | #7 | AI-native substrate |
| Compositing (blend / blur / clip) + scene transitions | #8 | Animation / beauty |
| Real text→image generator + Style Capsule | #9 | AI visuals |
| LMS packaging (SCORM / cmi5 / Common Cartridge) | #10 | Delivery / market |
| Typography & layout (pro fonts, multi-line text, color math, adult themes) | #11 | Beauty / adult-ready |
| Engine paint upgrade (gradients, shadows, dashed strokes, backdrop system) | #12 | Beauty |
| Diagram substrate (connectors, box shapes, data tables, flowcharts) | #13 | Technical teaching |

That covers the substrate → math flagship → interactivity → adaptivity → distribution arc, the
generated-visual substrate, and the K-12 → adult/college/enterprise foundation (typography, paint,
diagrams).

**Remaining (highest-leverage first):**
- **AI visuals:** character/mascot identity (reference-conditioned consistency) · vision-grounded
  scene critic + self-improving eval harness · agentic Planner→Storyboard→Draft→Critic→Reviser pipeline.
- **Animation/rendering:** spring/physics motion · sub-frame motion blur · Lottie import via Skottie ·
  handwriting "Write" for text and equations · a camera system (pan / zoom / parallax).
- **Pedagogy:** branching segment-graph (+ remediation) · contingent hint ladder · parametric
  item bank · Socratic "ask-the-character" tutor · UDL audio-first pre-reader mode.
- **Delivery/accessibility:** Audio Description (auto-generated from the timeline) · VPAT / WCAG-AA +
  flash-safety lint · platform presets (9:16 safe-area, per-platform LUFS, ABR) · emotion-directed
  TTS + SSML · one-click multilingual · white-label brand kits.

The natural next three (each builds on what's merged): **character/mascot identity**, a
**vision-grounded scene critic**, and **Audio Description + accessibility (VPAT / flash-safety)**.

---

## Two architectural meta-insights (these shape everything)

Both surfaced independently in multiple threads, and both extend patterns **already in the repo**:

1. **The "Frozen Asset Store" — generate-then-freeze, content-addressed.**
   `src/audio/ttsCache.ts` already wraps a non-deterministic, paid cloud call in a
   content-addressed disk cache (hash → bytes, atomic write, free-on-repeat, idempotent
   across distributed retries). **Generalize it to images, characters, video B-roll,
   cloned voices, and translations.** Then the governing rule is: *non-determinism lives
   only in an offline bake whose output is content-addressed and frozen; the renderer
   composites frozen bytes and stays a byte-exact pure function.* This is the single most
   important unlock for going AI-native without breaking the determinism guarantee.

2. **The "Sidecar + thin Player" — the engine stays pure; everything new is a sidecar.**
   `RenderService.putCaptions` already emits `.vtt`/`.srt` keyed off the content hash.
   The same pattern emits `interactions.json`, `descriptions.vtt`, xAPI telemetry,
   conformance reports, and chapter/transcript data — and a small web **player** overlays
   interactivity at the **narration-beat timestamps we already have** (`NarrationSegment.t`).
   Because renders are deterministic + content-addressed, **branching/remediation segments
   are free-on-repeat**. Interactivity, assessment, adaptivity, and accessibility all land
   as sidecars + player logic, not engine rewrites.

---

## Top cross-cutting bets (synthesized across threads)

Ordered by leverage and dependency. The first three are *substrate* — much else depends on them.

| # | Bet | Why it's top | Impact/Effort | Determinism fit |
|---|---|---|---|---|
| 1 | **Frozen Asset Store + `image`/`path` nodes** | The substrate for SVG icons, generated illustrations, characters, B-roll, translations. Generalizes `ttsCache.ts`. | H / M | Bake offline → hash → freeze; render byte-exact |
| 2 | **Bézier `path` primitive + SVG import + shape morphing** | Keystone for icon import, the 3B1B "any shape → any shape" morph, handwriting, and math glyphs. `Path2D` (incl. SVG `d`) is *already* in `@napi-rs/canvas`. | H / M | Pure function of `t` (flubber resample) |
| 3 | **Interaction sidecar + thin "Showman Player"** | Generalizes the caption sidecar into pause-respond / MCQ / drag-drop / hotspots at beat timestamps. Embedded questions ≈ +15–25% post-test, lower dropout. | H / M–H | Sidecar + player; engine untouched |
| 4 | **Learner model (BKT) + spaced-retrieval scheduler** | Highest-evidence pedagogy (interleaving d≈0.83; spacing strong). Turns a content library into a mastery system. | H / H | Client-side runtime; no engine change |
| 5 | **Style-locked illustrations ("Style Capsule") + character/mascot identity** | The visible leap (clip-art → art-directed show w/ a recurring face) and the hard AI problem. Nano Banana Pro / Midjourney `--cref` make it tractable zero-shot. | H / M–H | Generate-then-freeze; capsule+sheet hashed |
| 6 | **LaTeX-quality math typesetting (KaTeX → glyph paths)** | Closes the biggest gap for the math-native flagship — real fractions/exponents/integrals, today only faked with `text`/`counter`. Glyphs-as-paths ⇒ morphable equations. | H / M–H | KaTeX layout deterministic; pin version+fonts |
| 7 | **Vision-grounded scene critic + self-improving eval harness** | Makes auto-authoring shippable without a human in every loop; lets you swap models on *evidence*. Closes the loop on the existing `preview` step. | H / M | Critic runs on frozen frames; verdict cached |
| 8 | **LMS packaging (cmi5/SCORM/Common Cartridge) + xAPI Video Profile telemetry** | The schools distribution channel + the entire analytics surface — mostly manifest/sidecar work over artifacts that already exist. | H / M | Post-render packaging stage |
| 9 | **Audio Description track (generated from the timeline)** | WCAG **AA** must-have; uniquely cheap for Showman (we own the timeline + scene graph — no STT/video analysis). A procurement moat. | H / M | Sidecar `descriptions.vtt` + TTS + multi-track mux |
| 10 | **Lottie/dotLottie import via Skottie** | Fastest jump in visual richness — taps an 800k+ kid-tuned animation library instead of a hand-built pipeline. | H / M–H | Pin `canvaskit-wasm`; software backend; goldens |

---

## Theme 1 — Animation & rendering tech

Key insight: **`@napi-rs/canvas` already exposes Path2D (incl. SVG `d`), `clip()`, blend
modes, `ctx.filter`, `drawImage`** — so several "big" features are low-risk (in the binary,
just not surfaced as node types). Beyond the top bets above:

- **Compositing toolkit** — `clip`/`mask`, blend modes, blur/drop-shadow/color filters →
  spotlights, magnify, "fill the jar to here," depth-of-field. **Build native** (no new dep). H/M.
- **Spring/physics motion tracks** — natural overshoot/settle; deterministic fixed-step
  integration keyed to fps (Remotion's `spring()` is the model). H/L–M.
- **Scene-to-scene transitions** — cross-fade/slide/wipe/iris between lesson beats
  (TransitionSeries-style; camera is intra-scene only today). H/M.
- **Handwriting "Write" draw-on** for text & equations (depends on #2). M–H/M.
- **Motion blur** via deterministic sub-frame accumulation (quality flag). M/L–M.
- **Procedural fills (SkSL)** — watercolor grain, living skies — *if* exposed via the CanvasKit surface. M/M–H.
- **Generative-video B-roll (Veo/Sora)** — *garnish only*, baked + frozen; the vector
  engine stays the spine. Deliberately limited (precise pedagogy beats generative video). L–M/H.
- **Don't adopt Rive** (runtime state machines — wrong shape for offline baking); **Lottie** is the bake-friendly choice.

## Theme 2 — Pedagogy & interactivity

The keystone is the interaction sidecar + player (bet #3). On top of it:

- **Branching segment-graph** (choose-path + misconception remediation) — free-on-repeat
  via content addressing (H5P Branching Scenario model). H/M.
- **Parametric item bank with misconception-keyed distractors** — infinite fresh retrieval,
  wrong-answer-as-diagnosis; reuses the math toolkit's parametric builders. H/M.
- **Contingent hint ladder** (nudge → hint → worked step → full example, on struggle) —
  productive failure + ITS-grade scaffolding (step-based ITS d≈0.76 ≈ human tutoring). H/M.
- **Learner model (BKT) + spaced-retrieval (FSRS)** — bet #4; the mastery engine. H/H, H/M.
- **Standards-conformant results (xAPI/cmi5) + H5P/SCORM export** — bet #8 (the adoption unlock).
- **Socratic "ask-the-character" tutor** — LLM grounded in the lesson transcript (which we
  authored) + the existing moderation gate. Khanmigo model (promising but unsettled). M–H/H.
- **UDL interaction layer** — audio-first pre-reader mode + picture choices + tap-to-define
  glossary + dual-language read-along (target users *can't read fluently yet*). M–H/M.
- **Affect-aware "optimal confusion" pacing + growth-mindset character feedback** — behavioral
  signals only (no camera); keep moves conservative. M/M.
- **Narrative quest wrapper (gamification, guard-railed)** — narrative + mastery-gated unlocks +
  humane streaks; **avoid** points/badges/leaderboards as the primary driver (overjustification). M/M.
- **Parent/teacher standards-mastery dashboard** — the buyer's view; closes the loop. M/M.

> Evidence grading: **strong** — retrieval practice, spacing, interleaving, embedded-question
> video, contingent hints, mastery/BKT, Mayer's principles. **Promising/unsettled** — Socratic
> AI tutor, productive failure (needs design fidelity). **Engagement-positive but learning-neutral
> / risky** — points/badges/leaderboards, behavioral affect detection. Design defensively.

## Theme 3 — AI-native authoring & multimodal

All gated by the Frozen Asset Store (bet #1). Beyond the top bets:

- **`image` node + `GeneratedAssetProvider`** (mirrors `TtsProvider`) — spec embeds
  `{assetHash, provenance:{model,seed,promptHash,refs}}`, never a URL/prompt. H/M.
- **Style Capsule** (frozen seed + style-prompt prefix + ref images, all hashed) → one
  art-directed look per lesson. **Character Sheet** (canonical poses/expressions, frozen) +
  reference-conditioning (Nano Banana Pro 5-person consistency; LoRA only for the flagship mascot). H/M, H/H.
- **Agentic pipeline** Planner → Storyboard → Draft → **Critic** → Reviser, each with a
  deterministic structured contract; only bake + critique are stochastic (frozen/cached).
  Extends the existing `agent.ts` loop. H/M.
- **Vision-grounded critic + self-improving eval harness** — bet #7; CI-gated quality flywheel. H/M.
- **Emotion-directed TTS** (beat emotions → ElevenLabs v3 audio tags) + **SSML + pronunciation
  lexicon** ("1/2"→"one half", "x²"→"x squared") + curated kid-friendly narrator catalog.
  Reuses `ttsCache.ts`. **Ethics: never clone child voices** (provider-prohibited; biometric PI). H/M.
- **One-click multilingual** — translate narration+captions, regen TTS per locale, **re-fit
  durations** (we already have `measureNarration`/`fitSceneDuration`), frozen per locale. H/M.
- **RAG authoring** over curriculum (CCSS/NGSS) + the frozen asset library (reuse, don't regen). M–H/M.
- **MCP generative tools** — extend `showmanTools.ts` with `plan_lesson`/`generate_asset`/
  `critique_scene`/`retrieve_*` so any agent (Claude/Cursor) can author through governed tools. M–H/M.

## Theme 4 — Delivery, formats, accessibility, analytics

Mostly sidecars + encode-time presets, not engine rewrites:

- **Audio Description track** — bet #9 (WCAG AA; auto-generated from timeline gaps; extended AD possible). H/M.
- **LMS packaging + xAPI Video Profile** — bet #8 (cmi5/SCORM/Common Cartridge; watch-through/
  drop-off/mastery telemetry to an LRS). H/M, H/M.
- **Platform delivery-preset matrix** — 9:16 1080×1920 + **safe-area insets** (TikTok action rail),
  per-platform **loudness** (≈ −14 LUFS web vs −23 broadcast), an **ABR ladder** (extend HLS),
  and **positioned/styled WebVTT captions**. Extends `ffmpegArgs.ts`/`loudness.ts`/`captions.ts`. H/M.
- **Accessibility Conformance Report (VPAT/ACR)** + caption-quality + **flash/seizure lint**
  (WCAG 2.3.1 — a hard child-safety gate; we own the pixels, so we can self-attest). H/M.
- **i18n substrate** — translation memory/glossary, ICU MessageFormat + locale number/plural
  formatting, **RTL/bidi shaping**, locale→voice catalog. H/H.
- **SSML + pronunciation lexicon** — correct math/number narration (shared with Theme 3). H/M.
- **Offline / low-bandwidth schools delivery** — data-saver rendition + downloadable bundle +
  integrity manifest (cmi5 offline-sync). M–H/M.
- **SEO/discovery bundle** — full + interactive transcript, chaptered VTT, schema.org
  `VideoObject`/`LearningResource` JSON-LD. M/L–M.
- **Sign-language PiP slot** — reserve the region now; prefer human interpreter (avatars not
  yet adequate). L–M/M.

### ⚠️ Compliance must-haves for a children's product
- **COPPA (amended)** — effective Jun 23 2025, compliance by **Apr 22 2026**. Voiceprints/biometrics
  are now PI (relevant to TTS); **separate verifiable parental consent** for third-party/ad data;
  data minimization. Telemetry must be pseudonymous + non-behavioral-ad + minimized.
- **GDPR-K / UK Children's Code** — protection-by-design/default, no dark patterns.
- **WCAG 2.2 media** — Captions (A), transcript/AD (A), **Audio Description (AA)**; DOJ ADA Title II
  sets WCAG 2.1 AA deadlines **Apr 2026 / 2027** for public entities (schools).
- **WCAG 2.3.1 Three-Flashes** — non-negotiable seizure-safety gate before publish.
- **Section 508** — VPAT/ACR for US federal/federally-funded procurement.
- **Pre-publish human approval + image-aware moderation** — record the approval in a per-video safety manifest.

## Theme 5 — Competitive landscape (lighter synthesis)

*(The dedicated thread was cut short; this is from prior analysis.)*

- **Content/tutoring incumbents** (Khan Academy, BrainPOP, Duolingo, Prodigy, IXL): great
  pedagogy + reach, but their video is hand-produced, not *agent-authored from a brief* — they
  can't generate a bespoke, on-standard lesson video on demand.
- **AI avatar-video tools** (Synthesia, HeyGen, Colossyan): fast talking-head video, but
  **not pedagogical, not deterministic, not math-native** — wrong medium for "show the math."
- **Manual explainer tools** (Vyond, Powtoon, Animaker): human editors, slow, not AI-authored.
- **Dev/animation frameworks** (Manim, Remotion, Motion Canvas, Rive): powerful but require a
  developer; not agent-driven or pedagogy-aware.
- **Generative video** (Sora/Veo/Runway/Kling): cinematic but **can't be trusted for exact
  numbers/labels/no-hallucination** — the opposite of what a math lesson needs.

**Showman's defensible moat:** *deterministic + agent-authored + pedagogy-as-code + math-native*,
with the **frozen-asset determinism contract** letting it absorb generative AI without losing
exactness. The features that **widen** the moat (hard to copy): the determinism/freeze contract,
the interaction+adaptivity platform on top of authored beats, math-native typesetting+morphing,
and standards/accessibility conformance. The features that would **commoditize** it: leaning on
raw generative video for the teaching core.

---

## Suggested sequencing

**Now (substrate + quick visual wins):** `path` primitive + SVG import + morphing (#2) ·
Frozen Asset Store + `image` node (#1) · compositing toolkit (clip/mask/blend/blur) · spring
motion · scene transitions. *(All determinism-safe; most reuse what's in the binary.)*

**Next (the platform + the leaps):** Interaction sidecar + Showman Player (#3) → branching +
item bank · KaTeX math typesetting (#6) · Style Capsule + character identity (#5) · vision
critic + eval harness (#7) · Lottie import (#10).

**Then (mastery + market):** BKT learner model + spaced retrieval (#4) · LMS packaging + xAPI
(#8) · Audio Description (#9) · platform delivery presets · i18n substrate + emotion/SSML TTS ·
the agentic pipeline + MCP generative tools.

**Always-on (gates):** COPPA/GDPR-K compliance, flash-safety lint, human-approval + image
moderation — non-negotiable for a kids' product.

*Generated from a 5-lens deep-research pass; per-thread sources are extensive (Manim, KaTeX,
Skottie, flubber, Remotion; learning-science meta-analyses on retrieval/spacing/interleaving/
ITS; H5P/xAPI/cmi5/SCORM; WCAG 2.2/Section 508/COPPA; Nano Banana Pro/FLUX/Midjourney/Veo).*
