/**
 * Fit authored text to the canvas.
 *
 * A model authoring a spec cannot measure rendered text, so it cannot tell whether what
 * it wrote fits: narration runs off the edge and labels land on top of each other. The
 * engine can measure it — it lays out the glyphs — so it does that here,
 * deterministically, instead of asking the model to guess pixel positions it cannot see.
 *
 * Three repairs, in order: wrap an over-wide line to the width actually available at its
 * anchor, clamp anything still crossing an edge back inside, then separate any two labels
 * that visibly collide. Canvas containment always wins over separation, so the pass
 * cannot oscillate.
 *
 * Pure: the input is deep-cloned and the clone is mutated, like `autoRepairSpec`. It runs
 * on unvalidated input, so anything it cannot read is skipped, never thrown on.
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

export interface Box {
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

function round2(n: number): number {
  return Number(n.toFixed(2));
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

/** Does this node animate something geometric? */
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
function layout(text: string, maxWidth: number | undefined, ctx: SKRSContext2D): { lines: string[]; widest: number } {
  // Mirrors src/engine/render.ts:459 — a single line with no positive maxWidth is painted
  // unwrapped, everything else goes through wrapText.
  const lines =
    !text.includes("\n") && !(maxWidth !== undefined && maxWidth > 0) ? [text] : wrapText(text, maxWidth, (s) => ctx.measureText(s).width);
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
function collect(nodes: unknown, dx: number, dy: number, sx: number, sy: number, blocked: boolean, out: Candidate[]): void {
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

/** Re-measure after a mutation that changed what the node paints. */
function remeasure(c: Candidate): void {
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
      repairs.push(`wrapped text "${label}" to maxWidth ${String(c.node["maxWidth"])}`);
    }
  }

  clampToCanvas(c, canvasW, canvasH, repairs);
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
