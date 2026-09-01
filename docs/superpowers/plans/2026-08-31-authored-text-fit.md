# Authored Text Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee deterministically that authored text renders inside the canvas and that no two authored labels collide, without asking the model to guess pixel positions it cannot measure.

**Architecture:** One pure function, `fitAuthoredText`, in a new module `src/authoring/textFit.ts`. It measures text through the same `wrapText` + measuring-canvas path the renderer uses, then wraps, clamps, and separates. `AuthoringAgent.authorSpec` calls it after `author.propose()` and before `expandBuilderPlacements`, so it only ever touches freehand text; builder geometry is inserted afterwards and never moved. Repairs are reported through the existing `AuthoringAttempt.repaired` channel.

**Tech Stack:** TypeScript (ESM, NodeNext resolution — every relative import ends in `.js`), Vitest, `@napi-rs/canvas` for text measurement.

**Spec:** `docs/superpowers/specs/2026-08-31-authored-text-fit-design.md`

## Global Constraints

- Relative imports MUST end in `.js` (NodeNext). `import { wrapText } from "../engine/textLayout.js";`
- `fitAuthoredText` MUST be pure: deep-clone the input via `structuredClone` and mutate the clone, exactly as `autoRepairSpec` does (`src/authoring/autoRepair.ts:138-152`).
- It runs on **unvalidated** input. It MUST never throw. Anything it cannot read — a non-object node, a missing `text`, a non-numeric coordinate — is skipped and left untouched.
- Constants, exact values: `EDGE_MARGIN = 16`, `MIN_WRAP_WIDTH = 80`, `MIN_COLLISION = 2`, `DEFAULT_LINE_HEIGHT = 1.25`.
- Determinism: document order only, no randomness, no `Date`, no iteration over unordered maps.
- `npm run verify` (typecheck + lint + format:check + test) MUST pass before the final commit.
- Do NOT modify `src/validator/validate.ts`, `src/engine/render.ts`, or `src/catalog/assemble.ts`. This change is confined to the authoring path.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/authoring/textFit.ts` | **Create.** The whole pass: walk, eligibility, measure, wrap, clamp, separate. Single export `fitAuthoredText`. |
| `test/unit/textFit.test.ts` | **Create.** Unit tests for the pass. |
| `src/authoring/agent.ts` | **Modify.** Call the pass; merge its repairs into `AuthoringAttempt.repaired`. |
| `prompts/author-examples.md` | **Modify.** Stop teaching label-on-artwork and no-`maxWidth`. |
| `test/unit/prompts.test.ts` | **Modify.** Assert the example no longer teaches the anti-pattern. |

---

### Task 1: The fit pass — measure, wrap, clamp

**Files:**
- Create: `src/authoring/textFit.ts`
- Test: `test/unit/textFit.test.ts`

**Interfaces:**
- Consumes: `wrapText` from `src/engine/textLayout.js`; `ensureFontsRegistered` from `src/engine/fonts.js`; `SHAPE_DEFAULTS` from `src/spec/schema.js`.
- Produces: `export function fitAuthoredText(spec: unknown): TextFitResult` where `interface TextFitResult { spec: unknown; repairs: string[] }`. Task 3 imports both.

- [ ] **Step 1: Write the failing test**

Create `test/unit/textFit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fitAuthoredText } from "../../src/authoring/textFit.js";

const base = (nodes: unknown[]) => ({
  specVersion: 1,
  width: 1280,
  height: 720,
  fps: 30,
  duration: 5,
  background: "#ffffff",
  nodes,
});

/** The exact line from issue #124: 757.6px at 28px Nunito, centred at x=300. */
const NARRATION = "During the positive half-cycle, the diode allows current to flow.";

type Box = { x0: number; x1: number; y0: number; y1: number };

/** Where a text node's box lands, using the same measurement the pass uses. */
function boxOf(spec: any, id: string): Box {
  const { measureBoxForTest } = require("../../src/authoring/textFit.js");
  return measureBoxForTest(spec, id);
}

describe("fitAuthoredText — canvas containment", () => {
  it("leaves a spec whose text already fits byte-identical", () => {
    const spec = base([{ id: "t", type: "text", text: "Hi", x: 640, y: 360, fontSize: 28, align: "center" }]);
    const before = JSON.stringify(spec);
    const result = fitAuthoredText(spec);
    expect(result.repairs).toEqual([]);
    expect(JSON.stringify(result.spec)).toBe(before);
  });

  it("wraps the issue's narration line so it stops running off the left edge", () => {
    const spec = base([{ id: "n", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }]);
    const out: any = fitAuthoredText(spec).spec;
    const node = out.nodes[0];
    expect(node.maxWidth).toBeGreaterThan(0);
    const box = boxOf(out, "n");
    expect(box.x0).toBeGreaterThanOrEqual(0);
    expect(box.x1).toBeLessThanOrEqual(1280);
  });

  it("reports what it did", () => {
    const spec = base([{ id: "n", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }]);
    const { repairs } = fitAuthoredText(spec);
    expect(repairs.length).toBeGreaterThan(0);
    expect(repairs.join(" ")).toMatch(/wrapped|moved/);
  });

  it("clamps a node parked far outside the canvas back inside", () => {
    const spec = base([{ id: "far", type: "text", text: "off in the weeds", x: -4000, y: 900, fontSize: 24 }]);
    const out: any = fitAuthoredText(spec).spec;
    const box = boxOf(out, "far");
    expect(box.x0).toBeGreaterThanOrEqual(0);
    expect(box.y1).toBeLessThanOrEqual(720);
  });

  it("is idempotent", () => {
    const spec = base([{ id: "n", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }]);
    const once = fitAuthoredText(spec).spec;
    const twice = fitAuthoredText(once);
    expect(twice.repairs).toEqual([]);
    expect(JSON.stringify(twice.spec)).toBe(JSON.stringify(once));
  });
});

describe("fitAuthoredText — eligibility", () => {
  it("leaves a node whose x is animated untouched", () => {
    const spec = base([
      {
        id: "slide",
        type: "text",
        text: NARRATION,
        x: 300,
        y: 600,
        fontSize: 28,
        align: "center",
        tracks: [{ property: "x", keyframes: [{ t: 0, value: -800 }, { t: 1, value: 300 }] }],
      },
    ]);
    const before = JSON.stringify(spec);
    const result = fitAuthoredText(spec);
    expect(result.repairs).toEqual([]);
    expect(JSON.stringify(result.spec)).toBe(before);
  });

  it("leaves a node under a rotated group untouched", () => {
    const spec = base([
      { id: "g", type: "group", x: 0, y: 0, rotation: 12, children: [{ id: "t", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }] },
    ]);
    const before = JSON.stringify(spec);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
    expect(JSON.stringify(fitAuthoredText(spec).spec)).toBe(before);
  });

  it("leaves a spec that declares a camera untouched", () => {
    const spec = { ...base([{ id: "n", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }]), camera: { x: 0, y: 0, zoom: 2 } };
    const before = JSON.stringify(spec);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
    expect(JSON.stringify(fitAuthoredText(spec).spec)).toBe(before);
  });

  it("still fits a node that only animates opacity", () => {
    const spec = base([
      {
        id: "fade",
        type: "text",
        text: NARRATION,
        x: 300,
        y: 600,
        fontSize: 28,
        align: "center",
        tracks: [{ property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }],
      },
    ]);
    expect(fitAuthoredText(spec).repairs.length).toBeGreaterThan(0);
  });

  it("skips malformed nodes without throwing", () => {
    const spec = base([null, { id: "no-text", type: "text", x: 10, y: 10 }, { id: "bad-x", type: "text", text: "hi", x: "nope", y: 10 }, "junk"]);
    expect(() => fitAuthoredText(spec)).not.toThrow();
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  it("returns a non-object spec untouched", () => {
    expect(fitAuthoredText(null).spec).toBeNull();
    expect(fitAuthoredText(42).repairs).toEqual([]);
  });
});
```

Replace the `boxOf` helper's `require` with a real import once Step 3 exports it — the import line at the top of the file becomes:

```ts
import { fitAuthoredText, measureBoxForTest } from "../../src/authoring/textFit.js";
```

and `boxOf` becomes:

```ts
function boxOf(spec: any, id: string): Box {
  const box = measureBoxForTest(spec, id);
  if (!box) throw new Error(`no measurable text node "${id}"`);
  return box;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/textFit.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/authoring/textFit.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/authoring/textFit.ts`:

```ts
/**
 * Fit authored text to the canvas.
 *
 * A model authoring a spec cannot measure rendered text, so it cannot tell whether
 * what it wrote fits: narration runs off the edge and labels land on top of each
 * other. The engine can measure it — it lays out the glyphs — so it does that here,
 * deterministically, instead of asking the model to guess pixel positions it cannot
 * see.
 *
 * Three repairs, in order: wrap an over-wide line to the width actually available at
 * its anchor, clamp anything still crossing an edge back inside, then separate any
 * two labels that visibly collide. Canvas containment always wins over separation, so
 * the pass cannot oscillate.
 *
 * Pure: the input is deep-cloned and the clone is mutated, like `autoRepairSpec`. It
 * runs on unvalidated input, so anything it cannot read is skipped, never thrown on.
 */
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { ensureFontsRegistered } from "../engine/fonts.js";
import { wrapText } from "../engine/textLayout.js";
import { SHAPE_DEFAULTS } from "../spec/schema.js";

export interface TextFitResult {
  /** A deep clone with the fixes applied (the input is never mutated). */
  spec: unknown;
  /** Human-readable notes, one per fix, for the caller's repair log. */
  repairs: string[];
}

/** px kept clear of every canvas edge. */
const EDGE_MARGIN = 16;
/** Below this, wrapping shreds a line into a one-word column — worse than the clipping. */
const MIN_WRAP_WIDTH = 80;
/** px of overlap on BOTH axes before two boxes count as colliding. */
const MIN_COLLISION = 2;
const DEFAULT_LINE_HEIGHT = 1.25;

/** Animating any of these invalidates reasoning from the static coordinates. */
const GEOMETRIC_PROPS = new Set(["x", "y", "scale", "scaleX", "scaleY", "rotation", "fontSize"]);

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Candidate {
  node: Record<string, unknown>;
  /** Canvas-space origin of the node (ancestor transforms applied). */
  originX: number;
  originY: number;
  /** Scale applied to the node's OWN x/y by its ancestors. */
  parentSx: number;
  parentSy: number;
  /** Scale applied to the node's glyphs (ancestors × its own). */
  effSx: number;
  effSy: number;
  box: Box;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function numOpt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// A single measuring context over the pinned fonts, matching src/layout/slides.ts.
// Build-time only — never the render path.
let measureCtx: SKRSContext2D | null = null;
function measurer(family: string, weight: number | string, fontSize: number): SKRSContext2D {
  if (!measureCtx) {
    ensureFontsRegistered();
    measureCtx = createCanvas(16, 16).getContext("2d");
  }
  measureCtx.font = `${weight} ${fontSize}px "${family}"`;
  return measureCtx;
}

/** Does this node (or its subtree root) animate something geometric? */
function hasGeometricTrack(node: Record<string, unknown>): boolean {
  const tracks = node["tracks"];
  if (!Array.isArray(tracks)) return false;
  return tracks.some((t) => isObject(t) && typeof t["property"] === "string" && GEOMETRIC_PROPS.has(t["property"]));
}

/** A node whose own transform makes an axis-aligned box unreliable. */
function breaksBoxMath(node: Record<string, unknown>): boolean {
  if (num(node["rotation"], 0) !== 0) return true;
  const sx = num(node["scaleX"], num(node["scale"], 1));
  const sy = num(node["scaleY"], num(node["scale"], 1));
  // Scaling happens around the anchor, which shifts the origin; bail rather than model it.
  if (node["anchor"] !== undefined && (sx !== 1 || sy !== 1)) return true;
  return false;
}

/** The lines the renderer will actually paint, and the widest of them. */
function layout(
  text: string,
  maxWidth: number | undefined,
  ctx: SKRSContext2D,
): { lines: string[]; widest: number } {
  // Mirrors src/engine/render.ts:459 — a single line with no positive maxWidth is
  // painted unwrapped, everything else goes through wrapText.
  const lines = !text.includes("\n") && !(maxWidth !== undefined && maxWidth > 0) ? [text] : wrapText(text, maxWidth, (s) => ctx.measureText(s).width);
  const widest = lines.reduce((w, l) => Math.max(w, ctx.measureText(l).width), 0);
  return { lines, widest };
}

/**
 * The box a text node paints into, in canvas space. Height is approximated by the font
 * size per line — the horizontal extent is what clips in practice, and an exact
 * ascent/descent box would still be an approximation across families.
 */
function measureBox(node: Record<string, unknown>, originX: number, originY: number, effSx: number, effSy: number): Box | null {
  const text = node["text"];
  if (typeof text !== "string" || text.length === 0) return null;
  const fontSize = num(node["fontSize"], SHAPE_DEFAULTS.fontSize);
  if (!(fontSize > 0)) return null;

  const family = typeof node["fontFamily"] === "string" ? node["fontFamily"] : SHAPE_DEFAULTS.fontFamily;
  const weightRaw = node["fontWeight"];
  const weight = typeof weightRaw === "number" || typeof weightRaw === "string" ? weightRaw : SHAPE_DEFAULTS.fontWeight;
  const align = node["align"] === "center" || node["align"] === "right" ? node["align"] : "left";
  const baseline = typeof node["baseline"] === "string" ? node["baseline"] : "top";
  const lineHeightPx = Math.max(0, num(node["lineHeight"], DEFAULT_LINE_HEIGHT)) * fontSize;

  const ctx = measurer(family, weight, fontSize);
  const { lines, widest } = layout(text, numOpt(node["maxWidth"]), ctx);
  const n = lines.length;

  // Horizontal, relative to the origin, matching ctx.textAlign.
  const localX0 = align === "center" ? -widest / 2 : align === "right" ? -widest : 0;
  // Vertical, matching the block offset in paintGlyphs (render.ts:466).
  const span = (n - 1) * lineHeightPx;
  const localY0 = baseline === "middle" ? -span / 2 - fontSize / 2 : baseline === "bottom" || baseline === "alphabetic" ? -span - fontSize : 0;

  return {
    x0: originX + localX0 * effSx,
    x1: originX + (localX0 + widest) * effSx,
    y0: originY + localY0 * effSy,
    y1: originY + (localY0 + span + fontSize) * effSy,
  };
}

/** Depth-first walk collecting every measurable text node with its canvas-space box. */
function collect(
  nodes: unknown,
  dx: number,
  dy: number,
  sx: number,
  sy: number,
  blocked: boolean,
  out: Candidate[],
): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (!isObject(raw)) continue;
    const node = raw;
    const stop = blocked || hasGeometricTrack(node) || breaksBoxMath(node);
    const originX = dx + num(node["x"], 0) * sx;
    const originY = dy + num(node["y"], 0) * sy;
    const ownSx = num(node["scaleX"], num(node["scale"], 1));
    const ownSy = num(node["scaleY"], num(node["scale"], 1));
    const effSx = sx * ownSx;
    const effSy = sy * ownSy;

    if (node["type"] === "group") {
      collect(node["children"], originX, originY, effSx, effSy, stop, out);
      continue;
    }
    if (node["type"] !== "text" || stop) continue;
    // A non-numeric coordinate means the spec is malformed here; leave it to the validator.
    if (node["x"] !== undefined && numOpt(node["x"]) === undefined) continue;
    if (node["y"] !== undefined && numOpt(node["y"]) === undefined) continue;

    const box = measureBox(node, originX, originY, effSx, effSy);
    if (box) out.push({ node, originX, originY, parentSx: sx, parentSy: sy, effSx, effSy, box });
  }
}

/** Re-measure after a mutation. */
function remeasure(c: Candidate): void {
  c.originX = c.originX; // origin only changes through moveBy, which updates it
  const box = measureBox(c.node, c.originX, c.originY, c.effSx, c.effSy);
  if (box) c.box = box;
}

/** Move a candidate by a canvas-space delta, writing back through its parent scale. */
function moveBy(c: Candidate, ddx: number, ddy: number): void {
  if (ddx !== 0 && c.parentSx !== 0) {
    c.node["x"] = round2(num(c.node["x"], 0) + ddx / c.parentSx);
    c.originX += ddx;
    c.box.x0 += ddx;
    c.box.x1 += ddx;
  }
  if (ddy !== 0 && c.parentSy !== 0) {
    c.node["y"] = round2(num(c.node["y"], 0) + ddy / c.parentSy);
    c.originY += ddy;
    c.box.y0 += ddy;
    c.box.y1 += ddy;
  }
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/** Width available to a node at its anchor, given its alignment. */
function availableWidth(node: Record<string, unknown>, originX: number, canvasW: number): number {
  const align = node["align"];
  const m = EDGE_MARGIN;
  if (align === "center") return Math.max(0, 2 * Math.min(originX - m, canvasW - m - originX));
  if (align === "right") return Math.max(0, originX - m);
  return Math.max(0, canvasW - m - originX);
}

function shortLabel(text: unknown): string {
  const s = typeof text === "string" ? text : "";
  return s.length > 32 ? `${s.slice(0, 32)}…` : s;
}

/** Wrap an over-wide line, then clamp anything still crossing an edge. */
function fitToCanvas(c: Candidate, canvasW: number, canvasH: number, repairs: string[]): void {
  const usable = canvasW - 2 * EDGE_MARGIN;
  const label = shortLabel(c.node["text"]);

  if (numOpt(c.node["maxWidth"]) === undefined) {
    const width = c.box.x1 - c.box.x0;
    let target: number | undefined;
    if (width > usable) {
      // Too wide to fit anywhere on the canvas — wrap to the usable width regardless of anchor.
      target = usable;
    } else if (c.box.x0 < EDGE_MARGIN || c.box.x1 > canvasW - EDGE_MARGIN) {
      const avail = availableWidth(c.node, c.originX, canvasW);
      if (avail >= MIN_WRAP_WIDTH && width > avail) target = avail;
    }
    if (target !== undefined && c.effSx !== 0) {
      c.node["maxWidth"] = Math.round(target / c.effSx);
      remeasure(c);
      repairs.push(`wrapped text "${label}" to maxWidth ${c.node["maxWidth"]}`);
    }
  }

  clampToCanvas(c, canvasW, canvasH, repairs);
}

/** Translate a candidate the minimum amount that brings its box inside the canvas. */
function clampToCanvas(c: Candidate, canvasW: number, canvasH: number, repairs: string[]): void {
  const m = EDGE_MARGIN;
  const label = shortLabel(c.node["text"]);
  let ddx = 0;
  let ddy = 0;

  // Wider than the canvas even after wrapping: pin the left edge — text reads
  // left-to-right, so losing the tail beats losing the head.
  if (c.box.x1 - c.box.x0 > canvasW - 2 * m || c.box.x0 < m) ddx = m - c.box.x0;
  else if (c.box.x1 > canvasW - m) ddx = canvasW - m - c.box.x1;

  if (c.box.y1 - c.box.y0 > canvasH - 2 * m || c.box.y0 < m) ddy = m - c.box.y0;
  else if (c.box.y1 > canvasH - m) ddy = canvasH - m - c.box.y1;

  if (ddx === 0 && ddy === 0) return;
  moveBy(c, ddx, ddy);
  const parts: string[] = [];
  if (ddx !== 0) parts.push(`${ddx > 0 ? "right" : "left"} by ${Math.abs(Math.round(ddx))}px`);
  if (ddy !== 0) parts.push(`${ddy > 0 ? "down" : "up"} by ${Math.abs(Math.round(ddy))}px`);
  repairs.push(`moved text "${label}" ${parts.join(" and ")} to keep it on canvas`);
}

export function fitAuthoredText(spec: unknown): TextFitResult {
  if (!isObject(spec)) return { spec, repairs: [] };
  // A camera re-maps the whole coordinate space; canvas-space reasoning is invalid.
  if (spec["camera"] !== undefined) return { spec, repairs: [] };
  const canvasW = numOpt(spec["width"]);
  const canvasH = numOpt(spec["height"]);
  if (!canvasW || !canvasH || canvasW <= 0 || canvasH <= 0) return { spec, repairs: [] };

  const clone = structuredClone(spec) as Record<string, unknown>;
  const repairs: string[] = [];
  const candidates: Candidate[] = [];
  collect(clone["nodes"], 0, 0, 1, 1, false, candidates);

  for (const c of candidates) fitToCanvas(c, canvasW, canvasH, repairs);

  return { spec: repairs.length > 0 ? clone : spec, repairs };
}

/** Test seam: the canvas-space box of the text node with `id`, or null. */
export function measureBoxForTest(spec: unknown, id: string): Box | null {
  if (!isObject(spec)) return null;
  const out: Candidate[] = [];
  collect(spec["nodes"], 0, 0, 1, 1, false, out);
  return out.find((c) => c.node["id"] === id)?.box ?? null;
}
```

Note on `remeasure`: drop the no-op first line (`c.originX = c.originX;`) — it is there only to flag that the origin is maintained by `moveBy`. Write the function as:

```ts
function remeasure(c: Candidate): void {
  const box = measureBox(c.node, c.originX, c.originY, c.effSx, c.effSy);
  if (box) c.box = box;
}
```

- [ ] **Step 4: Fix the test file's import**

Replace the `boxOf` helper defined with `require` in Step 1 with the real import, as described at the end of Step 1.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/unit/textFit.test.ts`
Expected: PASS, 12 tests.

If "leaves a spec whose text already fits byte-identical" fails, the likely cause is that `fitAuthoredText` returned the clone rather than the original — the final line returns `spec` unchanged when `repairs` is empty, so check no repair was recorded spuriously.

- [ ] **Step 6: Commit**

```bash
git add src/authoring/textFit.ts test/unit/textFit.test.ts
git commit -m "feat(authoring): measure authored text and fit it to the canvas"
```

---

### Task 2: Separate colliding labels

**Files:**
- Modify: `src/authoring/textFit.ts`
- Test: `test/unit/textFit.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `Box`, `moveBy`, `clampToCanvas`, `MIN_COLLISION`, `shortLabel` from Task 1.
- Produces: no new exports. `fitAuthoredText`'s behaviour widens; its signature does not change.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/textFit.test.ts`:

```ts
describe("fitAuthoredText — label collisions", () => {
  const overlaps = (a: Box, b: Box) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) >= 2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) >= 2;

  it("separates two labels sitting at identical coordinates", () => {
    const spec = base([
      { id: "a", type: "text", text: "12V AC Input", x: 400, y: 300, fontSize: 28 },
      { id: "b", type: "text", text: "Diode (0.7V drop)", x: 400, y: 300, fontSize: 28 },
    ]);
    const out: any = fitAuthoredText(spec).spec;
    expect(overlaps(boxOf(out, "a"), boxOf(out, "b"))).toBe(false);
  });

  it("keeps the separated label on the canvas", () => {
    const spec = base([
      { id: "a", type: "text", text: "12V AC Input", x: 400, y: 690, fontSize: 28 },
      { id: "b", type: "text", text: "Diode (0.7V drop)", x: 400, y: 690, fontSize: 28 },
    ]);
    const out: any = fitAuthoredText(spec).spec;
    for (const id of ["a", "b"]) {
      const box = boxOf(out, id);
      expect(box.y0).toBeGreaterThanOrEqual(0);
      expect(box.y1).toBeLessThanOrEqual(720);
    }
  });

  it("moves the later node, not the earlier one", () => {
    const spec = base([
      { id: "a", type: "text", text: "first", x: 400, y: 300, fontSize: 28 },
      { id: "b", type: "text", text: "second", x: 400, y: 300, fontSize: 28 },
    ]);
    const out: any = fitAuthoredText(spec).spec;
    expect(out.nodes[0].x).toBe(400);
    expect(out.nodes[0].y).toBe(300);
    expect(out.nodes[1].y).not.toBe(300);
  });

  it("leaves labels that merely sit near each other alone", () => {
    const spec = base([
      { id: "a", type: "text", text: "left", x: 200, y: 300, fontSize: 24 },
      { id: "b", type: "text", text: "right", x: 800, y: 300, fontSize: 24 },
    ]);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  it("stays idempotent once labels are separated", () => {
    const spec = base([
      { id: "a", type: "text", text: "12V AC Input", x: 400, y: 300, fontSize: 28 },
      { id: "b", type: "text", text: "Diode (0.7V drop)", x: 400, y: 300, fontSize: 28 },
    ]);
    const once = fitAuthoredText(spec).spec;
    expect(fitAuthoredText(once).repairs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/textFit.test.ts -t "collisions"`
Expected: FAIL — "separates two labels sitting at identical coordinates" reports `true` (they still overlap).

- [ ] **Step 3: Write the implementation**

Add to `src/authoring/textFit.ts`, above `fitAuthoredText`:

```ts
/** Overlap of two boxes per axis; negative or zero means they are clear on that axis. */
function overlapOf(a: Box, b: Box): { ox: number; oy: number } {
  return { ox: Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy: Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) };
}

function collides(a: Box, b: Box): boolean {
  const { ox, oy } = overlapOf(a, b);
  return ox >= MIN_COLLISION && oy >= MIN_COLLISION;
}

/**
 * Push each colliding pair apart along the axis of least displacement, moving the
 * LATER node in document order. Canvas containment wins: if re-clamping the moved node
 * restores the overlap, the clamp is kept and the collision is left recorded but
 * unresolved, so the pass cannot oscillate.
 */
function separate(candidates: Candidate[], canvasW: number, canvasH: number, repairs: string[]): void {
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (!collides(a.box, b.box)) continue;

      const { ox, oy } = overlapOf(a.box, b.box);
      const aCy = (a.box.y0 + a.box.y1) / 2;
      const bCy = (b.box.y0 + b.box.y1) / 2;
      const aCx = (a.box.x0 + a.box.x1) / 2;
      const bCx = (b.box.x0 + b.box.x1) / 2;

      // Ties and equal centres resolve the same way every run: push down, or right.
      if (oy <= ox) moveBy(b, 0, bCy < aCy ? -oy - 1 : oy + 1);
      else moveBy(b, bCx < aCx ? -ox - 1 : ox + 1, 0);

      clampToCanvas(b, canvasW, canvasH, []);
      const label = shortLabel(b.node["text"]);
      const other = shortLabel(a.node["text"]);
      repairs.push(
        collides(a.box, b.box)
          ? `text "${label}" still overlaps "${other}" after clamping to the canvas`
          : `moved text "${label}" clear of "${other}"`,
      );
    }
  }
}
```

Then call it from `fitAuthoredText`, replacing the single loop:

```ts
  for (const c of candidates) fitToCanvas(c, canvasW, canvasH, repairs);
  separate(candidates, canvasW, canvasH, repairs);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/textFit.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/authoring/textFit.ts test/unit/textFit.test.ts
git commit -m "feat(authoring): push colliding authored labels apart"
```

---

### Task 3: Wire the pass into the authoring loop

**Files:**
- Modify: `src/authoring/agent.ts:133-166`
- Test: `test/unit/textFit.test.ts`

**Interfaces:**
- Consumes: `fitAuthoredText` from `./textFit.js` (Task 1).
- Produces: repairs surfaced on `AuthoringAttempt.repaired`, the existing field on the existing interface. No signature changes.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/textFit.test.ts`:

```ts
import { AuthoringAgent, ScriptedAuthor } from "../../src/authoring/agent.js";
import { validateScene } from "../../src/index.js";

/** Minimal ShowmanClient: real validation, no rendering. */
const stubClient = () =>
  ({
    getSchema: async () => ({}) as never,
    validate: async (spec: unknown) => validateScene(spec as never),
    preview: async () => ({ ok: true, errors: [] }),
    submit: async () => ({ ok: true, jobId: "job-1", errors: [] }),
  }) as never;

describe("authoring loop reports text fixes", () => {
  it("fits authored text and records the repair", async () => {
    const spec = base([{ id: "n", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }]);
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([spec]));
    const result = await agent.authorSpec("half-wave rectifier");

    expect(result.ok).toBe(true);
    expect(result.history.at(-1)?.repaired?.join(" ")).toMatch(/wrapped|moved/);
    const node = (result.spec as any).nodes[0];
    expect(node.maxWidth).toBeGreaterThan(0);
  });

  it("leaves a spec that already fits without recording repairs", async () => {
    const spec = base([{ id: "n", type: "text", text: "Hi", x: 640, y: 360, fontSize: 28, align: "center" }]);
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([spec]));
    const result = await agent.authorSpec("hi");

    expect(result.ok).toBe(true);
    expect(result.history.at(-1)?.repaired).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/textFit.test.ts -t "authoring loop"`
Expected: FAIL — `expected undefined to match /wrapped|moved/`, because the agent does not call the pass yet.

- [ ] **Step 3: Modify the agent**

In `src/authoring/agent.ts`, add the import beside the existing `builderPlacements` one:

```ts
import { fitAuthoredText } from "./textFit.js";
```

Replace this block (currently at `src/authoring/agent.ts:133-146`):

```ts
      // A spec may reference catalog builders for geometry a model cannot place by
      // eye -- schematics above all. Expand before validation, so everything
      // downstream sees an ordinary spec.
      const built = expandBuilderPlacements(spec, defaultRegistry());
```

with:

```ts
      // The model cannot measure rendered text, so it cannot tell whether what it
      // wrote fits the canvas. Do that here, BEFORE builder expansion, so the pass
      // only ever touches text the model placed freehand -- builder geometry is
      // inserted afterwards and never repositioned.
      const fitted = fitAuthoredText(spec);
      spec = fitted.spec;
      let repaired: string[] | undefined = fitted.repairs.length > 0 ? [...fitted.repairs] : undefined;

      // A spec may reference catalog builders for geometry a model cannot place by
      // eye -- schematics above all. Expand before validation, so everything
      // downstream sees an ordinary spec.
      const built = expandBuilderPlacements(spec, defaultRegistry());
```

Then delete the now-duplicated declaration two lines below the `validate` call:

```ts
      let validation = await this.client.validate(spec);
      let repaired: string[] | undefined;      // <- DELETE THIS LINE
```

Then merge instead of overwriting, in the two places `repaired` is assigned inside the auto-repair branch:

```ts
          if (reval.valid) {
            spec = fix.spec;
            validation = reval;
            repaired = [...(repaired ?? []), ...fix.fixed];
          } else {
            retainBestCandidate(fix.spec, 1_000 + reval.errors.length);
            history.push({ attempt, valid: false, errorCount: reval.errors.length, repaired: [...(repaired ?? []), ...fix.fixed] });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/textFit.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Run the existing authoring suite for regressions**

Run: `npx vitest run test/unit/templateAuthor.test.ts test/unit/builderPlacements.test.ts test/unit/autoRepair.test.ts test/unit/openRouterAuthor.test.ts`
Expected: PASS, no failures.

- [ ] **Step 6: Commit**

```bash
git add src/authoring/agent.ts test/unit/textFit.test.ts
git commit -m "feat(authoring): fit authored text before the spec is validated"
```

---

### Task 4: Stop the few-shot example teaching the defect

**Files:**
- Modify: `prompts/author-examples.md`
- Test: `test/unit/prompts.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

Context: the RC example currently draws `"Resistor R"` at `(305,180)` — dead centre on the resistor rect spanning `x=250..360, y=155..205` — and sets no `maxWidth` on any text node. It is the one worked example the system prompt tells the author to study.

**Constraint:** `test/unit/prompts.test.ts:24` asserts the system prompt contains `V_C(t)`. Keep that equation text exactly.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("authoring prompt pack", ...)` block in `test/unit/prompts.test.ts`:

```ts
  // The example is the one worked spec the author is told to study, so anything it
  // demonstrates gets copied. It used to draw a label dead-centre on the shape it
  // annotates and never set maxWidth -- both are issue #124's defects.
  it("demonstrates wrapped text and labels clear of their artwork", () => {
    const sys = loadPrompts().system("schema");
    const specs = [...sys.matchAll(/^\{"specVersion".*$/gm)].map((m) => JSON.parse(m[0]));
    expect(specs.length).toBeGreaterThan(0);

    const texts = specs.flatMap((s: any) => s.nodes.filter((n: any) => n.type === "text"));
    expect(texts.length).toBeGreaterThan(0);
    // Every multi-word label shows the wrap control.
    for (const t of texts.filter((n: any) => n.text.split(" ").length > 1)) {
      expect(t.maxWidth, `"${t.text}" should set maxWidth`).toBeGreaterThan(0);
    }

    // No text node sits inside a rect it is not the caption of.
    for (const spec of specs) {
      const rects = spec.nodes.filter((n: any) => n.type === "rect");
      for (const t of spec.nodes.filter((n: any) => n.type === "text")) {
        for (const r of rects) {
          const inside = t.x > r.x && t.x < r.x + r.width && t.y > r.y && t.y < r.y + r.height;
          expect(inside, `"${t.text}" sits on top of rect "${r.id}"`).toBe(false);
        }
      }
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/prompts.test.ts -t "demonstrates wrapped text"`
Expected: FAIL — `"Resistor R" sits on top of rect "resistor"`.

- [ ] **Step 3: Rewrite the example**

Replace the whole of `prompts/author-examples.md` with:

```markdown
EXAMPLE — brief → Scene Spec (study the shape, then author for the real brief):
Brief: "show a blue square labelled Hi"
Spec:
{"specVersion":1,"width":640,"height":360,"fps":30,"duration":2,"seed":1,"background":"#ffffff","nodes":[{"id":"sq","type":"rect","x":270,"y":100,"width":100,"height":100,"radius":12,"fill":"#2563eb"},{"id":"label","type":"text","x":320,"y":240,"text":"Hi","fontFamily":"Nunito","fontSize":32,"fill":"#1e293b","align":"center","baseline":"middle","maxWidth":240}]}

EXAMPLE — technical equation plus labelled diagram:
Brief: "For an undergraduate electronics student, connect an RC charging circuit to its equation"
Spec:
{"specVersion":1,"width":800,"height":450,"fps":30,"duration":6,"seed":2,"background":"#ffffff","nodes":[{"id":"wire","type":"polyline","points":[{"x":100,"y":180},{"x":700,"y":180}],"stroke":"#334155","strokeWidth":4},{"id":"resistor","type":"rect","x":250,"y":155,"width":110,"height":50,"fill":"#fde68a","stroke":"#334155","strokeWidth":3},{"id":"resistor-label","type":"text","x":305,"y":232,"text":"Resistor R","fontFamily":"Nunito","fontSize":22,"fill":"#0f172a","align":"center","baseline":"middle","maxWidth":180},{"id":"capacitor","type":"rect","x":500,"y":155,"width":40,"height":50,"fill":"#bfdbfe","stroke":"#334155","strokeWidth":3},{"id":"capacitor-label","type":"text","x":520,"y":232,"text":"Capacitor C","fontFamily":"Nunito","fontSize":22,"fill":"#0f172a","align":"center","baseline":"middle","maxWidth":180},{"id":"equation","type":"text","x":400,"y":330,"text":"V_C(t) = V(1 − e^(−t/RC))","fontFamily":"Nunito","fontSize":32,"fill":"#1d4ed8","align":"center","baseline":"middle","maxWidth":600}]}
```

Three changes, each deliberate:

1. Every label moved below the shape it annotates instead of on top of it (`y:232` clears the rects, which end at `y=205`).
2. Every multi-word text node sets `maxWidth`.
3. `"Capacitor C"` now labels an actual capacitor rect — previously it labelled nothing at all, teaching the model that a label alone stands in for a symbol.

This edits text already present in the prompt rather than appending a new section, so it does not add the nested-JSON depth that destabilised the response format in the #125 experiment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/prompts.test.ts`
Expected: PASS, all tests including the pre-existing `V_C(t)` assertion.

- [ ] **Step 5: Commit**

```bash
git add prompts/author-examples.md test/unit/prompts.test.ts
git commit -m "fix(authoring): stop the worked example teaching labels on top of artwork"
```

---

### Task 5: Full verification

**Files:** none modified.

- [ ] **Step 1: Run the full verify gate**

Run: `npm run verify`
Expected: typecheck clean, lint clean, format check clean, all tests pass.

- [ ] **Step 2: Fix formatting if `format:check` fails**

Run: `npm run format && npm run verify`

- [ ] **Step 3: Confirm the issue's own case end to end**

Run:

```bash
npx tsx -e '
import { fitAuthoredText } from "./src/authoring/textFit.js";
const line = "During the positive half-cycle, the diode allows current to flow.";
const spec = { specVersion:1, width:1280, height:720, fps:30, duration:5, background:"#fff",
  nodes:[{ id:"n", type:"text", text:line, x:300, y:600, fontSize:28, align:"center" }] };
const r = fitAuthoredText(spec);
console.log(r.repairs);
console.log(JSON.stringify((r.spec as any).nodes[0]));
'
```

Expected: a `wrapped text …` repair, and the node carrying a `maxWidth` around 568.

- [ ] **Step 4: Commit any formatting fixes**

```bash
git add -A
git commit -m "style: format text fit pass"
```

---

## Self-Review

**Spec coverage:** Scope (Task 1 canvas containment, Task 2 collisions; label-vs-artwork explicitly excluded and recorded in the spec) · Where it runs (Task 3) · Measurement (Task 1 `measurer`/`layout`/`measureBox`) · Eligibility, all three rules (Task 1 `hasGeometricTrack`, `breaksBoxMath`, camera check, tested) · Repairs 1-3 (Task 1 `fitToCanvas`/`clampToCanvas`, Task 2 `separate`) · Constants (Global Constraints, Task 1) · Reporting (Task 1 repair strings, Task 3 merge into `repaired`) · Prompt change (Task 4) · Testing table (all nine rows covered across Tasks 1-3).

**Type consistency:** `TextFitResult { spec, repairs }` is used identically in Tasks 1 and 3. `Candidate`, `Box`, `moveBy`, `clampToCanvas`, `shortLabel`, `MIN_COLLISION` are defined in Task 1 and consumed unchanged in Task 2. `measureBoxForTest` is exported in Task 1 and used by tests in Tasks 1-2.
