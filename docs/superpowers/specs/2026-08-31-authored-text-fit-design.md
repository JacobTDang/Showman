# Deterministic text-fit pass for authored specs

Issue: [#124](https://github.com/JacobTDang/Showman/issues/124) — authored text runs off
the canvas and collides with the artwork.

## Problem

Nothing on the authored path measures rendered text, so nothing can tell whether it
fits. Three facts establish it:

1. `validateScene` accepts a text node at `x=-4000`, one at `x=99999`, and two text
   nodes at identical coordinates — zero errors. Node position is entirely
   unconstrained.
2. `src/engine/render.ts:459` takes a fast path and paints one unwrapped line unless
   `maxWidth` is set. The reported narration line measures 757.6px at 28px Nunito, so
   centred at `x=300` it spans `-78.8..678.8` on a 1280 canvas — clipped at the left
   edge, exactly as the issue reports.
3. `maxWidth` appears in the compact schema digest only as a bare name in a comma list.
   Nothing states it is the wrap control, and the sole few-shot example never sets it.
   That is why clipping is intermittent while collisions are not.

An author cannot self-correct this: it has no measurement of rendered text. The engine
does — it lays out the glyphs.

## Scope

Enforced:

- no authored text box leaves the canvas
- no two authored text boxes visibly overlap each other

Explicitly **not** enforced: a label overlapping the artwork it annotates. "The artwork
it annotates" is not recoverable from a flat node list, and a label centred inside its
own shape is frequently intentional — the catalog's own captions and builder labels do
it. Flagging that would reject correct output. This is recorded on #124 rather than
silently dropped.

Also out of scope: `counter` nodes. They paint glyphs through the same `paintGlyphs`
path but are short numeric readouts, not the reported defect.

## Design

One new module, `src/authoring/textFit.ts`, exporting one pure function:

```ts
export function fitAuthoredText(spec: unknown): { spec: unknown; repairs: string[] }
```

Pure and deterministic: same input, same output, no randomness, no I/O beyond the
shared measuring canvas.

### Where it runs

In `AuthoringAgent.authorSpec`, immediately after `author.propose()` and **before**
`expandBuilderPlacements`:

```
propose → fitAuthoredText → expandBuilderPlacements → validate → preview → semantic
```

Running before expansion is deliberate. It means the pass only ever touches text the
model placed freehand; builder output is inserted afterwards and never repositioned,
which is the whole reason builder geometry is trustworthy. It also means the existing
`validate` call already covers the pass's output, so no extra round trip is needed.

Because it runs on unvalidated input, the pass skips anything it cannot read —
non-numeric coordinates, a missing `text`, a malformed `nodes` array — rather than
throwing. A spec it cannot understand is returned untouched.

### Measurement

Reuses the recipe proven in `src/layout/slides.ts:48-56`: a lazily created
`createCanvas(16, 16)` context over `ensureFontsRegistered()`, with extents taken
through the same `wrapText` the renderer calls. Predicted line breaks therefore match
what actually paints.

The box is derived from the measured line extents exactly as `paintGlyphs` positions
them — `align` (`left`/`center`/`right`) sets the horizontal origin, `baseline`
(`top`/`middle`/`alphabetic`/`bottom`) sets the vertical one, and `lineHeight`
(default 1.25) sets line spacing — then offset by the accumulated ancestor translation
and multiplied by the accumulated ancestor scale.

### Eligibility

A text node is repaired only when it is genuinely measurable. Otherwise it is left
untouched:

- **no track on a geometric property** — `x`, `y`, `scale`, `scaleX`, `scaleY`,
  `rotation`, `fontSize` — on the node or any ancestor. A track fully overrides the
  static value (`src/engine/resolve.ts:52-59`), so an animated node is not where its
  static coordinates say. A label sliding in from off-canvas is intentional.
- **no rotation** anywhere in its ancestry. A rotated box is not axis-aligned and the
  containment arithmetic no longer holds.
- **the spec declares no `camera`**. A camera re-maps the entire coordinate space, so
  canvas-space reasoning about node coordinates is invalid.

Tracks on `opacity`, `fill`, `stroke`, or `reveal` are fine — they do not move glyphs.
A `reveal` track is measured against the full string, which is its maximum extent.

### Repairs

Applied in this fixed order, in document order:

**1. Wrap.** If the box is wider than the space available at its anchor and the node has
no `maxWidth`, set `maxWidth` to the available width and re-measure. Available width
depends on alignment, and is chosen to keep the node where the author put it:

| align    | available width                                   |
|----------|---------------------------------------------------|
| `center` | `2 × min(x − M, W − M − x)`                       |
| `left`   | `W − M − x`                                       |
| `right`  | `x − M`                                           |

where `W` is the canvas width and `M` is `EDGE_MARGIN`. If the available width falls
below `MIN_WRAP_WIDTH`, wrapping is skipped — shredding a line into a one-word-per-line
column is worse than the clipping it fixes — and step 2 handles the node instead.

**2. Clamp.** If the box still crosses an edge, translate `x`/`y` by the minimum amount
that brings it fully inside. If the box is wider than the canvas even after wrapping (a
single unbreakable word), align its left edge rather than its right: text reads
left-to-right, so losing the tail is less damaging than losing the head. The vertical
rule is the same, favouring the top edge.

**3. Separate.** For each pair of remaining text boxes overlapping by at least
`MIN_COLLISION` in **both** axes, push the later node in document order along the axis
of least displacement until the boxes just clear, then re-clamp it via step 2.
Requiring overlap on both axes avoids the misleading area-ratio comparisons that thin
boxes produce.

**Canvas containment wins.** If re-clamping a separated node restores the overlap, the
clamp is kept and the overlap is recorded as unresolved. The pass never oscillates.

### Constants

```ts
const EDGE_MARGIN = 16;      // px kept clear of every canvas edge
const MIN_WRAP_WIDTH = 80;   // below this, wrapping shreds rather than helps
const MIN_COLLISION = 2;     // px of overlap on both axes before two boxes "collide"
```

### Reporting

Each action appends one human-readable line to `repairs`, e.g.:

```
wrapped text "During the positive half-cycle…" to maxWidth 552
moved text "During the positive half-cycle…" right by 79px to keep it on canvas
moved text "Diode (0.7V drop)" down by 34px to clear "12V AC Input"
```

`AuthoringAgent` merges these into the existing `AuthoringAttempt.repaired` array — the
same channel `autoRepairSpec` already reports through. No retry budget is spent and the
model is never asked to guess pixel positions it cannot see.

## Prompt change

`prompts/author-examples.md` currently teaches both defects in the one worked example
the author is told to study: `"Resistor R"` is drawn dead-centre on the resistor rect,
and no text node sets `maxWidth`. Both are corrected — labels moved clear of their
shapes, `maxWidth` set on the text.

This edits text already present in the prompt rather than appending a new section, so it
does not add the nested-JSON depth that destabilised the response format in the #125
experiment. The gate backstops it either way.

## Testing

Written first, per TDD.

| Test | Asserts |
|---|---|
| over-wide line | gains `maxWidth`, wraps, box lands inside the canvas |
| half-wave rectifier narration | the issue's actual line, centred at `x=300` on 1280, ends up fully on canvas |
| two labels at identical coordinates | separated; neither overlaps after the pass |
| node with an `x` track | returned untouched |
| node under a rotated group | returned untouched |
| spec declaring a `camera` | returned untouched |
| already-clean spec | returned byte-identical, `repairs` empty |
| second pass | idempotent — no further repairs |
| malformed node | skipped, no throw |

Plus the existing suite stays green, and `npm run verify` passes.

## Acceptance criteria mapping

- [x] No authored text renders outside the canvas — steps 1 and 2, enforced deterministically.
- [ ] A label does not overlap the artwork it annotates — **out of scope**, see Scope above.
- [x] A label does not overlap another label — step 3.
- [x] Enforced deterministically, not by asking the model to be careful — a pure function in the pipeline; the prompt change is a backstop, not the mechanism.
