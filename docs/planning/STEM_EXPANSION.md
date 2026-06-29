# STEM + Domain Expansion — plan

Five builders that take Showman from K-12 + adult-general into **tech, finance, chemistry, and
physics**, each leaning on the existing substrate (deterministic vector rendering, LaTeX, connectors
with arrowheads, coordinate planes, tables, paint, typography). Everything is a **pure builder** over
existing primitives unless noted, so the renderer stays a byte-exact `(spec, frame) → pixels` function.

Design bar for every one: **beautiful and engaging** — color systems, gradients and soft shadows for
depth, and motion (draw-on, staggered reveals, count-ups) rather than static diagrams.

Order is impact-per-effort. Each ships on its own branch: plan → implement → tests → adversarial
review → CI → merge.

---

## 1. Chemistry — `mhchem` + molecules + reactions  (`src/chem/`)

- **Notation:** load the `mhchem` MathJax extension into `src/math/tex.ts` so `\ce{H2O}`,
  `\ce{2H2 + O2 -> 2H2O}`, states, and charges typeset as first-class morphable glyph paths.
  `chemEquation(formula)` wraps a bare formula in `\ce{…}`.
- **`molecule({ atoms, bonds })`** — atoms as filled circles labeled with the element symbol, colored
  by the **CPK** palette (C dark, O red, H white, N blue, …) with a soft radial highlight + shadow for
  depth; bonds as single/double/triple lines. A few preset small molecules (water, CO₂, methane,
  ethanol) with hand-tuned layouts.
- **`reaction({ reactants, products, conditions })`** — formulas joined by `+`, a labeled reaction
  **arrow** (reuses the connector, conditions over the arrow), with an optional draw-on so the arrow
  sweeps in.
- Engaging: atoms pop in (scale + opacity stagger), the reaction arrow draws on, bonds fade in.

## 2. Data-viz chart suite — `src/chart/`  (serves finance + sciences + data)

One module, many domains. Built on `coordinatePlane`-style scaffolding + the paint layer.

- **`barChart`** (grouped/stacked, vertical/horizontal), **`lineChart`** (multi-series), **`areaChart`**,
  **`scatterChart`**, and **`candlestick`** (finance). Shared axis/legend/gridline/label engine with
  measured tick formatting (currency, %, thousands) and category vs numeric axes.
- Beautiful: gradient fills, soft shadows, a curated categorical palette (theme-aware), rounded bar
  caps, subtle gridlines.
- Engaging: bars grow from the baseline, lines + areas draw on left→right, points pop in, axis labels
  count up — all via the existing track/easing system.

## 3. Code blocks — `src/code/`  (tech / CS)

- **`codeBlock({ code, lang })`** — build-time tokenization (a small, vendored, frozen highlighter)
  into colored monospace runs; line-number gutter; optional highlight bands for specific lines; a
  window chrome (title bar + three dots) for polish.
- Beautiful: a dark "editor" theme with a syntax palette; the chrome + a soft shadow read as a real
  editor card.
- Engaging: typed-on reveal (reuse `reveal`), and a highlight band that slides to the focused line.

## 4. Physics — vectors + circuits  (`src/physics/`)

- **`vector` / `forceDiagram`** — labeled force arrows from a point (reuses the connector's
  arrowheads), with magnitude/angle and a component-decomposition option; ideal for free-body diagrams.
- **`circuit`** — a symbol set (resistor, battery, capacitor, switch, lamp, ground) placed on a grid
  and wired with orthogonal connectors; clean schematic look.
- Engaging: vectors grow from their origin; current "flows" as an animated dashed wire (marching ants
  via `dashOffset`).

## 5. Icons + camera — polish that lifts everything  (`src/icon/`, engine)

- **`icon(name)`** — a vendored, frozen Lucide/Feather-style path table rendered through the existing
  deterministic `path` pipeline (no generation). Consistent line-weight glyphs for tech, apparatus, UI.
- **Camera** — the one engine change: a keyframed camera (pan / zoom / parallax) applied as a single
  global matrix before the node loop in `render.ts`, doubling as "zoom to this detail." Byte-exact
  (just a transform).

---

## Determinism

Builders 1–4 and the icon set are pure functions emitting Scene Spec nodes — the renderer is
untouched, so determinism is free. `mhchem` is build-time LaTeX (already proven byte-stable via the
bundled glyph-path pipeline). The camera is a deterministic matrix. Every feature adds golden frames.

## Tests

Per feature: builder output validates against `validateScene`, render-based pixel checks for the
key visual (a bar grows, an arrow points the right way, a token is colored, an atom is CPK-correct),
determinism (render-twice byte-equality), and a golden frame. Beautiful/engaging treatments are
verified by the golden + targeted pixel assertions.
