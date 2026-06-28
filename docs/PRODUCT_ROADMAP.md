# Showman — Product Roadmap

What the animation engine needs next to become the best tool for **beautiful,
narrated, pedagogical learning videos for children, authored by AI agents.**

This is a PM-style feature map distilled from a 5-lens product review (learning
science, animation craft, benchmark vs. best-in-class, agent authoring, and
delivery/accessibility), grounded in the current codebase. The engine, distributed
render path, authoring loop, and the **counting→algebra math toolkit** are done and
CI-green; everything below is *new capability*, not bug-fixing.

Ratings: **impact** × **effort** (H/M/L). "Convergent" = independently raised by
multiple lenses (the strongest signal).

---

## ✅ Shipped: a real narration voice 🎙️ (was the convergent #1)

**Done.** Real cloud TTS behind the existing `TtsProvider` interface:
`OpenAiTtsProvider` + `ElevenLabsTtsProvider` (raw-PCM, resampled to 22050), a
content-addressed disk `CachingTtsProvider` (reproducible + free on repeat +
idempotent across distributed retries), `createDefaultTts()` env selection (mirrors
`createDefaultAuthor`), a per-render cost guard, and `measureNarration`/
`fitSceneDuration` so real speech isn't truncated. Network-free unit tests +
ffmpeg integration test in CI; live tests gated behind keys. Set `OPENAI_API_KEY`
or `ELEVENLABS_API_KEY` and every lesson speaks. Next up: word-level karaoke timing
and a voice catalog (Phase B).

---

## Phase A — Polish & quick wins (high impact, low effort)

Ship these first; each is days, not weeks, and visibly raises quality.

| Feature | Lens | I/E |
|---|---|---|
| **Soft shadows & glow** on nodes (depth, "pop") | animation | H/L |
| **Gradient & radial fills** (skies, backgrounds, ribbons) | animation | H/M |
| **Timeline / sequencing helper** (`after`, `stagger`, `withGap` — author beats without hand-computing `t`) | animation | H/L |
| **Layout primitives** (row / column / grid / center + safe-area) — stop hand-placing x/y | authoring | H/M |
| **Learning-objective + standards metadata** on `SceneSpec` (objective, grade band, CCSS id) → an opening "today we'll learn…" card + catalog/search | pedagogy | H/L |
| **Exemplar spec gallery** (few-shot cookbook the LLM author retrieves from) | authoring | M/L |
| **Accessibility theme pack** (dyslexia-friendly font, high-contrast, reduced-motion) | delivery | M/L |
| **Delivery bundle** (auto poster/thumbnail, chapter markers, SRT sidecar — extends the existing captions sidecar) | delivery | M/L |

## Phase B — Differentiators (high impact, medium effort)

These are what make the videos feel *crafted* and pedagogically real.

| Feature | Lens | I/E |
|---|---|---|
| **Camera system** (push-in / pan / focus-on-node) — direct attention, the #1 missing "cinematic" tool | animation, benchmark | H/M |
| **Word-level (karaoke) caption timing + voiceover-synced highlighting** | benchmark, delivery | H/M |
| **Check-for-Understanding beat** (pose a question → silent think-time → animated answer reveal) | pedagogy | H/M |
| **Interactive quiz card + assessment sidecar** (`quiz.json` next to the mp4 for a player to grade) | pedagogy | H/M |
| **Automated scene critique / quality linter** (an agent-callable "is this clear, balanced, on-screen, paced?" check) | authoring | H/M |
| **LessonPlan IR / storyboard compiler** (a structured lesson DSL between brief and raw nodes) | authoring | H/M |
| **Particle / confetti / sparkle emitter** (celebrate a correct answer) | animation | H/M |
| **Path-following motion** (move a node along a polyline/curve) | animation | H/M |
| **Worked-example fading** (worked → partially-blanked → "you try") | pedagogy | H/M |
| **Misconception / distractor beat** (name the common wrong answer, show why) | pedagogy | H/M |
| **Age/grade-adaptive pacing** (speech rate, dwell, items-per-screen by grade band) | pedagogy | H/M |

## Phase C — Big bets (high impact, higher effort)

Brand- and reach-defining; schedule deliberately.

| Feature | Lens | I/E |
|---|---|---|
| **Image / SVG asset nodes** (drop in illustrations & icons — unlocks real richness) | animation | H/H |
| **Recurring mascot / character system** (a friendly face = brand identity & engagement) | benchmark | H/H |
| **TransformMatching morph** (smoothly morph one expression/shape into another — the 3Blue1Brown signature) | benchmark | H/H |
| **Multi-aspect-ratio responsive layout** (vertical 9:16 for mobile/shorts, square 1:1, 16:9) | delivery | H/H |
| **Multi-language / i18n** narration + captions | delivery | H/H |
| **Background music + SFX bed** with auto-ducking under narration | benchmark, delivery | M/M |
| **Spaced-retrieval lesson sequencer** (sequence objectives into a unit with interleaved review) | pedagogy | M/M |

## Platform & ops (from the earlier gap review — non-feature, enables scale/trust)

- **Image-aware moderation + human-approval workflow** before a kids' video publishes (today: text-rule `RuleBasedModeration` only).
- **Production adapters** behind existing interfaces: **S3** storage, **Redis** queue, **Postgres** job persistence (today: local/in-memory).
- **Distributed tracing** + **load testing**; bump CI actions off the deprecated Node 20.

---

## Recommendation — the next three to build

1. **Real neural-TTS voice provider** — makes every existing lesson actually narrated. The product's namesake capability.
2. **Camera system + soft shadows/glow + gradients** — the biggest jump in perceived *beauty* for the least work; immediately lifts all existing math/counting lessons.
3. **Check-for-Understanding beat + learning-objective metadata** — turns "videos that tell" into "videos that teach," and is the foundation for quizzes, worked-example fading, and sequencing.

Together these hit all three pillars — *narrated* (1), *beautiful* (2), *pedagogical* (3) — on top of the content breadth the math toolkit already provides.

*(Generated from a 5-lens product panel; see git history for the analysis run.)*
