# Visual Appeal & Feature Brief

*PM pass — June 2026. Goal: make the visuals not just clear but **appealing, warm, and crafted** — never "corporate/clip-art flat." Plus a ranked list of features to add and existing ones to refine.*

---

## The core finding

The engine is **functionally complete but visually restrained**. The renderer already
supports everything needed for a premium look:

- **Linear & radial gradients**, **drop-shadow / glow**, **Gaussian blur**, **13 blend
  modes**, **dash patterns**, **rounded corners**, and **rich backgrounds** (base
  gradient + vignette + film grain).

…yet:

- **Gradients appear in under 2% of builders.** Almost every math/physics/chem builder
  emits **flat solid fills with hard edges**.
- **The themes carry no depth language.** A `Theme` is six flat color tokens + fonts.
  There is **no gradient token, no elevation/shadow token, no glow token, no surface
  ramp.** So even a careful builder has nothing to reach for.
- **Shadows are avoided** because raw shadow-*blur* is the one cross-platform
  non-deterministic feature (it would break golden frames).

**That gap — capable renderer, flat design language — is exactly what reads as
"corporate."** The fix is not new primitives; it's a **design-system layer** plus a
**styling pass** through the existing builders. This is high-impact, low-risk, and
golden-safe if we use gradients (deterministic) and radial-gradient *glows* (already
proven safe in `pointCharge`/`molecule`) instead of raw blur in golden scenes.

---

## A. Visual refinement — the priority (make it appealing, not corporate)

Ranked by impact-per-effort.

### A1. Theme depth tokens (one change re-skins everything) — **do first**
Extend `Theme`/`Palette` with optional, golden-safe depth tokens:
- `bgGradient` — a soft 2–3 stop background ramp per theme (replaces the flat page fill).
- `surface` — card/panel fill + a subtle elevation (radial-gradient highlight, not blur).
- `glow` — an accent halo color for "alive" elements (counters, correct answers, hot flames).
- `swatchRamp(i)` — each counting swatch resolves to a 2-stop gradient (lighter top →
  saturated bottom) so dots/bars/chips get dimensional fills for free.
Add a `depth: "flat" | "soft" | "rich"` knob so authors (and golden scenes) can dial it
down. Default `soft`.

### A2. A shared styling helper — consistency without per-builder bespoke code
A small `surface()` / `chip()` / `fillRamp()` helper in `src/theme/` (or `src/render/`)
that builders call to get: gradient fill + gentle top highlight + rounded corners +
optional soft glow, all from theme tokens. Threading this through builders is then
mechanical and uniform.

### A3. Builder polish pass — the 12 flattest, highest-traffic builders
Apply A1/A2 to (in priority order):
1. **barGraph / barChart** — gradient bars (saturated base → light top) + soft drop
   shadow; rounded bar tops.
2. **numberSentence counters & math chips** — radial-gradient chips with a highlight,
   not flat circles.
3. **tenFrame / arrayGrid / dotPattern** — dimensional dots + soft cell backgrounds +
   rounded cells.
4. **baseTenBlocks** — shaded block faces (gradient) so place-value reads as 3D.
5. **balanceScale** — gradient pans/beam for a tactile "shelf" feel.
6. **apparatus (glassware)** — gradient liquid (meniscus highlight) + **glow on the
   bunsen flame** (radial gradient, golden-safe).
7. **forceDiagram / vector arrows** — gradient along the arrow + soft shadow for pop.
8. **flowchart boxes / diagram shapes** — set the (already-parameterized) corner radius
   by default + subtle surface gradient + shadow.
9. **numberLine** — rounded, dimensional tick markers and a soft track.
10. **percentRing / fractionCircle** — gradient sweep + a faint track ring.
11. **periodicTable cells** — subtle per-category gradient instead of flat fill.
12. **quizCard / item cards** — surface elevation + accent glow on the correct reveal.

### A4. Background richness (tasteful, opt-in)
Wire a default **vignette + faint film grain** per theme (already supported) so scenes
have atmosphere instead of a dead flat field. Off by default in golden specs.

### A5. A non-corporate visual mode — "sketch / hand-drawn"
The `handwriting`/`penStroke` system already draws things on like a hand. A
`style: "sketch"` lesson option (slightly jittered strokes, draw-on everything, marker
chips) would give an explicitly **playful, human** alternative to clean vector — a
strong anti-corporate identity for younger lessons.

### A6. Golden-safety discipline (so none of this breaks CI)
- Gradients & dash = deterministic → safe everywhere.
- Radial-gradient **glow** = safe (proven in `pointCharge`, `molecule`).
- Raw shadow-**blur** = the only risk → gate behind the `depth` knob, forced off in
  golden scenes (the molecule builder's `shadow:false` pattern is the template).

---

## B. New features worth adding (delight + pedagogy)

From the roadmap's unshipped Phase A/B, ranked for **appeal**:

| Feature | Why it fights "corporate" | Effort |
|---|---|---|
| **Particle / confetti / sparkle emitter** | Celebration beats; pure delight | Low–Med |
| **Mascot / character system** | The single biggest identity move — a friendly guide who reacts, points, celebrates | High |
| **Spotlight / focus vignette** | Cinematic attention direction (group-clip exists) | Low |
| **Spring-settle & path-following motion polish** | Things *arrive and flow* instead of snapping | Low |
| **Check-for-understanding beat** (pose → think-time → reveal) | Pedagogy + suspense pacing | Med |
| **Asset / SVG image nodes** | Real illustrations alongside procedural art (`image` primitive exists) | Med |
| **Multi-aspect 9:16 / 1:1** | Shorts/reels format | Med |
| **Accessibility theme pack** (dyslexia-friendly, high-contrast, reduced-motion) | Inclusive + a differentiator | Low–Med |

## C. Refinements to existing features

- **CI test hygiene** — *in progress this session.* Systemic gap found: builders compute
  real geometry but tests asserted only node existence/counts, so a broken builder could
  pass. Adding value-level assertions + filling validator reject branches (camera block,
  negative/NaN keyframe `t`, NaN coords).
- **Stale roadmap docs** — `SCIENCE_PHYSICS_ROADMAP.md`/`PRODUCT_ROADMAP.md` list the
  camera as "missing," but it shipped (there's a camera golden). Reconcile the docs.
- **Font glyph coverage** — pinned families lack subscript digits, arrows (→), λ, ∫, so
  builders fall back to ASCII (no tofu). Worth a curated supplemental glyph set or a
  documented fallback so chemistry/math notation can use real symbols.
- **Blend modes** — 13 are defined and essentially unused; a couple (multiply for
  shadows, screen for glow) would enrich the depth pass.

---

## Recommended first increment

**A1 + A2 + the top ~4 of A3** (theme depth tokens, the styling helper, and applying it
to barGraph, counters/chips, tenFrame/arrayGrid, and apparatus). One coherent PR that
visibly lifts perceived craft across many existing lessons, fully golden-safe, with new
golden frames to lock the look. Everything else (mascot, particles, sketch mode) builds
on that foundation.
