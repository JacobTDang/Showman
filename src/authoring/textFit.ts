/**
 * Fit authored text to the canvas.
 *
 * A model authoring a spec cannot measure rendered text, so it cannot tell whether what
 * it wrote fits: narration runs off the edge and labels land on top of each other. The
 * engine can measure it — it lays out the glyphs — so it does that here,
 * deterministically, instead of asking the model to guess pixel positions it cannot see.
 *
 * Four repairs, in order: wrap an over-wide line to the width actually available at its
 * anchor, clamp anything still crossing an edge back inside, lift a label off the artwork
 * it is lying across, then separate any two labels that visibly collide. Canvas
 * containment always wins, so the pass cannot oscillate.
 *
 * The artwork test is legibility, not geometry. Nothing links a label to the shape it
 * describes, and a label centred inside its own shape is a deliberate idiom — a flowchart
 * box, a button, a card — so "overlaps a shape" rejects correct output. What is wrong is a
 * label that lies ACROSS a filled shape's edge, with half its glyphs on one ground and half
 * on another; and a label that sits wholly on a fill it cannot be read against. The first
 * is nudged clear, the second is only reported, because the fix for it is a colour and this
 * pass does not choose colours.
 *
 * Pure: the input is deep-cloned and the clone is mutated, like `autoRepairSpec`. It runs
 * on unvalidated input, so anything it cannot read is skipped, never thrown on.
 */
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { contrastRatio, mix, parseColor, wcagTextContrastMin } from "../engine/color.js";
import { ensureFontsRegistered } from "../engine/fonts.js";
import { wrapText } from "../engine/textLayout.js";
import { SHAPE_DEFAULTS } from "../spec/schema.js";

export interface TextFitResult {
  /** A deep clone with the fixes applied (the input is never mutated). */
  spec: unknown;
  /** Human-readable notes, one per fix, for the caller's repair log. */
  repairs: string[];
}

/** px kept clear of every canvas edge, on a canvas big enough to spare them. */
const EDGE_MARGIN = 16;
/** Below this, wrapping shreds a line into a one-word column — worse than the clipping. */
const MIN_WRAP_WIDTH = 80;
/** px of overlap on BOTH axes before two boxes count as colliding. */
const MIN_COLLISION = 2;
const DEFAULT_LINE_HEIGHT = 1.25;

/**
 * How much of a label must fall on EACH side of a shape's edge before it reads as lying
 * across that edge. Less than this on the shape and it merely grazes the artwork, which
 * costs nothing to read; less than this off the shape and it is on the shape on purpose
 * with a corner hanging over, and dragging it off would be the worse picture.
 */
const MIN_OCCLUSION = 0.2;
/**
 * A fill this close to the scene background paints no visible ground: text over it reads
 * exactly as it does over the background, so it is not occluded by anything.
 */
const MIN_GROUND_CONTRAST = 1.1;
/** Minimum effective opacity for a shape whose colour we cannot read (image, gradient). */
const MIN_OPAQUE = 0.5;
/** Sample grid over a label's box, used to measure how much of it lands on a shape. */
const SAMPLE_COLS = 7;
const SAMPLE_ROWS = 3;

/** Animating any of these invalidates reasoning from the static coordinates. */
const GEOMETRIC_PROPS = new Set(["x", "y", "scale", "scaleX", "scaleY", "rotation", "fontSize"]);
/** Node types whose painted region can be decided from static props alone. */
const OCCLUDING_TYPES = new Set(["rect", "ellipse", "polygon", "image"]);
/** Animating any of these moves or resizes a shape's painted footprint. */
const FOOTPRINT_PROPS = new Set([...GEOMETRIC_PROPS, "width", "height", "radius", "innerRadius", "sides"]);
/** Animating either of these means the shape may not be painted when the label shows. */
const PAINT_PROPS = new Set(["opacity", "fill"]);
/** A regular polygon is sampled as drawn; past this many sides it is a circle anyway. */
const MAX_POLYGON_SIDES = 128;

/** A closed time interval in seconds during which something is on screen. */
type Interval = [start: number, end: number];
/** When a node is visible: a list of intervals, or null meaning the whole scene. */
type Windows = Interval[] | null;
const FOREVER = Number.POSITIVE_INFINITY;

/**
 * When an opacity track leaves a node visible, following the sampler's rules: the first
 * keyframe's value holds before it, the last one's after, and between two keyframes the
 * value is interpolated — so a span is on screen if either of its ends is. Two labels
 * sequenced this way never share the frame, and pushing them apart wrecks a layout the
 * author built deliberately. No opacity track means always visible.
 */
function windowsOf(node: Record<string, unknown>): Windows {
  const tracks = node["tracks"];
  if (!Array.isArray(tracks)) return null;
  const track = tracks.find((t) => isObject(t) && t["property"] === "opacity") as { keyframes?: unknown } | undefined;
  const kfs = Array.isArray(track?.keyframes)
    ? (track.keyframes as unknown[])
        .filter((k): k is { t: number; value: number } => isObject(k) && typeof k["t"] === "number" && typeof k["value"] === "number")
        .sort((a, b) => a.t - b.t)
    : [];
  if (kfs.length === 0) return null;

  const out: Interval[] = [];
  const first = kfs[0]!;
  const last = kfs[kfs.length - 1]!;
  if (first.value > 0) out.push([0, first.t]);
  for (let i = 0; i + 1 < kfs.length; i++) {
    const a = kfs[i]!;
    const b = kfs[i + 1]!;
    if (a.value > 0 || b.value > 0) out.push([a.t, b.t]);
  }
  if (last.value > 0) out.push([last.t, FOREVER]);
  return merge(out);
}

/** Coalesce touching or overlapping intervals so later comparisons stay simple. */
function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const prev = out[out.length - 1];
    if (prev && iv[0] <= prev[1]) prev[1] = Math.max(prev[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** A node is on screen only when it AND every ancestor are. */
function intersectWindows(a: Windows, b: Windows): Windows {
  if (a === null) return b;
  if (b === null) return a;
  const out: Interval[] = [];
  for (const x of a)
    for (const y of b) {
      const lo = Math.max(x[0], y[0]);
      const hi = Math.min(x[1], y[1]);
      if (hi > lo) out.push([lo, hi]);
    }
  return out;
}

/** Do two nodes ever share the frame for a positive length of time? */
function coVisible(a: Windows, b: Windows): boolean {
  const both = intersectWindows(a, b);
  return both === null || both.length > 0;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The canvas the text has to fit, and the margin it keeps clear of the edges. */
interface Frame {
  w: number;
  h: number;
  m: number;
}

/**
 * A fixed 16px margin is nonsense on a small canvas — it would reserve half the width of
 * a 64px-wide scene — so it scales down with the frame and only reaches its full value
 * once there is room to spare.
 */
function frameOf(w: number, h: number): Frame {
  return { w, h, m: Math.min(EDGE_MARGIN, Math.round(Math.min(w, h) * 0.05)) };
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
  /** Opacity multiplied down from the ancestors, including the node's own. */
  alpha: number;
  /** When this label is on screen, its own fade intersected with every ancestor's. */
  visible: Windows;
  box: Box;
}

/** A filled region that can hide a label drawn across it. */
interface Occluder {
  node: Record<string, unknown>;
  /** Canvas-space bounding box — the cheap reject, and the basis for the escape moves. */
  box: Box;
  /** Is this canvas-space point actually painted? Exact for the shape, not its box. */
  covers: (x: number, y: number) => boolean;
  /** The colour it paints over the background, or null when it is not one colour. */
  ground: string | null;
}

/** State inherited from the ancestors during the walk. */
interface Inherited {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  alpha: number;
  /** An ancestor makes reasoning from static coordinates unsafe. */
  blocked: boolean;
  /** An ancestor animates its paint, so what it shows is not static. */
  fading: boolean;
  /** When the ancestors leave their subtree on screen. */
  visible: Windows;
}

/** What the walk collects. */
interface Collected {
  text: Candidate[];
  shapes: Occluder[];
  background: string;
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

/** Does this node animate any of these properties? */
function animates(node: Record<string, unknown>, props: ReadonlySet<string>): boolean {
  const tracks = node["tracks"];
  if (!Array.isArray(tracks)) return false;
  return tracks.some((t) => isObject(t) && typeof t["property"] === "string" && props.has(t["property"]));
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
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
  const localY0 =
    baseline === "middle" ? -span / 2 - fontSize / 2 : baseline === "bottom" || baseline === "alphabetic" ? -span - fontSize : 0;

  return {
    x0: originX + localX0 * effSx,
    x1: originX + (localX0 + widest) * effSx,
    y0: originY + localY0 * effSy,
    y1: originY + (localY0 + span + fontSize) * effSy,
  };
}

/**
 * The local-space size of a shape's painted box, or null when it cannot be known
 * statically — an image without explicit dimensions is drawn at its natural size, which
 * only the renderer knows.
 */
function footprint(node: Record<string, unknown>, type: string): { w: number; h: number } | null {
  if (type === "polygon") {
    const r = num(node["radius"], 50);
    return r > 0 ? { w: 2 * r, h: 2 * r } : null;
  }
  const w = type === "image" ? numOpt(node["width"]) : num(node["width"], SHAPE_DEFAULTS.width);
  const h = type === "image" ? numOpt(node["height"]) : num(node["height"], SHAPE_DEFAULTS.height);
  if (w === undefined || h === undefined || !(w > 0) || !(h > 0)) return null;
  return { w, h };
}

/** A regular polygon's / star's vertices in local space, exactly as `drawPolygon` lays them out. */
function polygonVertices(node: Record<string, unknown>, r: number): Array<{ x: number; y: number }> {
  const sidesRaw = node["sides"];
  const sides = Math.min(MAX_POLYGON_SIDES, Math.max(3, typeof sidesRaw === "number" ? Math.floor(sidesRaw) : 3));
  const innerRaw = numOpt(node["innerRadius"]);
  const star = innerRaw !== undefined && innerRaw >= 0;
  const inner = star ? Math.max(0, innerRaw) : 0;
  const count = star ? sides * 2 : sides;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const rad = star ? (i % 2 === 0 ? r : inner) : r;
    const a = -Math.PI / 2 + (star ? (i * Math.PI) / sides : (i * 2 * Math.PI) / sides);
    pts.push({ x: r + rad * Math.cos(a), y: r + rad * Math.sin(a) });
  }
  return pts;
}

function insidePolygon(pts: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The shape as something a label can be hidden by, or null when it hides nothing: an
 * outline, a fill that matches the background, a wash too faint to read as ground, or
 * geometry/paint that animates and so cannot be pinned to one static footprint.
 */
function occluderOf(
  node: Record<string, unknown>,
  inh: Inherited,
  originX: number,
  originY: number,
  effSx: number,
  effSy: number,
  background: string,
): Occluder | null {
  const type = node["type"];
  if (typeof type !== "string" || !OCCLUDING_TYPES.has(type)) return null;
  if (inh.fading || animates(node, FOOTPRINT_PROPS) || animates(node, PAINT_PROPS)) return null;
  if (effSx === 0 || effSy === 0) return null;
  const local = footprint(node, type);
  if (!local) return null;

  const alpha = inh.alpha * clamp01(num(node["opacity"], 1));
  if (alpha <= 0) return null;

  let ground: string | null = null;
  if (node["gradient"] !== undefined || type === "image") {
    // No single colour to compare against; it still hides whatever is under it.
    if (alpha < MIN_OPAQUE) return null;
  } else {
    const raw = typeof node["fill"] === "string" ? node["fill"] : SHAPE_DEFAULTS.fill;
    const parsed = parseColor(raw);
    if (!parsed) return null;
    ground = mix(background, raw, parsed.a * alpha);
    if (contrastRatio(ground, background) < MIN_GROUND_CONTRAST) return null;
  }

  const box: Box = {
    x0: Math.min(originX, originX + local.w * effSx),
    x1: Math.max(originX, originX + local.w * effSx),
    y0: Math.min(originY, originY + local.h * effSy),
    y1: Math.max(originY, originY + local.h * effSy),
  };
  // Ancestor rotation is excluded by `breaksBoxMath`, so canvas -> local is this inverse.
  const toLocal = (x: number, y: number): { lx: number; ly: number } => ({ lx: (x - originX) / effSx, ly: (y - originY) / effSy });

  let covers: (x: number, y: number) => boolean;
  if (type === "ellipse") {
    const rx = local.w / 2;
    const ry = local.h / 2;
    covers = (x, y) => {
      const { lx, ly } = toLocal(x, y);
      const nx = (lx - rx) / rx;
      const ny = (ly - ry) / ry;
      return nx * nx + ny * ny <= 1;
    };
  } else if (type === "polygon") {
    const pts = polygonVertices(node, local.w / 2);
    covers = (x, y) => {
      const { lx, ly } = toLocal(x, y);
      return insidePolygon(pts, lx, ly);
    };
  } else {
    covers = (x, y) => {
      const { lx, ly } = toLocal(x, y);
      return lx >= 0 && lx <= local.w && ly >= 0 && ly <= local.h;
    };
  }

  return { node, box, covers, ground };
}

/** Depth-first walk collecting the measurable text nodes and the artwork they sit on. */
function collect(nodes: unknown, inh: Inherited, into: Collected): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (!isObject(raw)) continue;
    const node = raw;
    const stop = inh.blocked || animates(node, GEOMETRIC_PROPS) || breaksBoxMath(node);
    const fading = inh.fading || animates(node, PAINT_PROPS);
    const originX = inh.dx + num(node["x"], 0) * inh.sx;
    const originY = inh.dy + num(node["y"], 0) * inh.sy;
    const ownSx = num(node["scaleX"], num(node["scale"], 1));
    const ownSy = num(node["scaleY"], num(node["scale"], 1));
    const effSx = inh.sx * ownSx;
    const effSy = inh.sy * ownSy;
    const alpha = inh.alpha * clamp01(num(node["opacity"], 1));
    const visible = intersectWindows(inh.visible, windowsOf(node));

    if (node["type"] === "group") {
      collect(node["children"], { dx: originX, dy: originY, sx: effSx, sy: effSy, alpha, blocked: stop, fading, visible }, into);
      continue;
    }
    if (stop) continue;
    // A non-numeric coordinate means the spec is malformed here; leave it to the validator.
    if (node["x"] !== undefined && numOpt(node["x"]) === undefined) continue;
    if (node["y"] !== undefined && numOpt(node["y"]) === undefined) continue;

    if (node["type"] === "text") {
      const box = measureBox(node, originX, originY, effSx, effSy);
      if (box) into.text.push({ node, originX, originY, parentSx: inh.sx, parentSy: inh.sy, effSx, effSy, alpha, visible, box });
      continue;
    }
    const shape = occluderOf(node, inh, originX, originY, effSx, effSy, into.background);
    if (shape) into.shapes.push(shape);
  }
}

/** How much of `box` lands on the shape, sampled over the label's own area. */
function coverage(box: Box, occ: Occluder): number {
  if (Math.min(box.x1, occ.box.x1) <= Math.max(box.x0, occ.box.x0)) return 0;
  if (Math.min(box.y1, occ.box.y1) <= Math.max(box.y0, occ.box.y0)) return 0;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  let inside = 0;
  for (let i = 0; i < SAMPLE_COLS; i++) {
    const x = box.x0 + ((i + 0.5) * w) / SAMPLE_COLS;
    for (let j = 0; j < SAMPLE_ROWS; j++) {
      if (occ.covers(x, box.y0 + ((j + 0.5) * h) / SAMPLE_ROWS)) inside++;
    }
  }
  return inside / (SAMPLE_COLS * SAMPLE_ROWS);
}

/**
 * How a label sits on a shape: clear of it, lying across its edge (the accident), or on
 * it (the deliberate placement — a flowchart box, a button, a card).
 */
function sitOf(box: Box, occ: Occluder): "clear" | "across" | "on" {
  const c = coverage(box, occ);
  if (c < MIN_OCCLUSION) return "clear";
  return c > 1 - MIN_OCCLUSION ? "on" : "across";
}

function liesAcross(box: Box, occ: Occluder): boolean {
  return sitOf(box, occ) === "across";
}

function acrossAny(box: Box, occluders: Occluder[]): boolean {
  return occluders.some((o) => liesAcross(box, o));
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
function availableWidth(node: Record<string, unknown>, originX: number, frame: Frame): number {
  const align = node["align"];
  const m = frame.m;
  if (align === "center") return Math.max(0, 2 * Math.min(originX - m, frame.w - m - originX));
  if (align === "right") return Math.max(0, originX - m);
  return Math.max(0, frame.w - m - originX);
}

function shortLabel(text: unknown): string {
  const s = typeof text === "string" ? text : "";
  return s.length > 32 ? `${s.slice(0, 32)}…` : s;
}

/** Translate a candidate the minimum amount that brings its box inside the canvas. */
function clampToCanvas(c: Candidate, frame: Frame, repairs: string[]): void {
  const m = frame.m;
  const label = shortLabel(c.node["text"]);
  let ddx = 0;
  let ddy = 0;

  // The criterion is the canvas edge, not the margin: text already fully on canvas is
  // left where the author put it, however close to the edge. Text that does cross an
  // edge is moved to sit a margin inside it, so it lands with breathing room.
  //
  // Wider than the canvas even after wrapping: pin the left edge — text reads
  // left-to-right, so losing the tail beats losing the head.
  if (c.box.x1 - c.box.x0 > frame.w || c.box.x0 < 0) ddx = m - c.box.x0;
  else if (c.box.x1 > frame.w) ddx = frame.w - m - c.box.x1;

  if (c.box.y1 - c.box.y0 > frame.h || c.box.y0 < 0) ddy = m - c.box.y0;
  else if (c.box.y1 > frame.h) ddy = frame.h - m - c.box.y1;

  if (ddx === 0 && ddy === 0) return;
  moveBy(c, ddx, ddy);
  const parts: string[] = [];
  if (ddx !== 0) parts.push(`${ddx > 0 ? "right" : "left"} by ${Math.abs(Math.round(ddx))}px`);
  if (ddy !== 0) parts.push(`${ddy > 0 ? "down" : "up"} by ${Math.abs(Math.round(ddy))}px`);
  repairs.push(`moved text "${label}" ${parts.join(" and ")} to keep it on canvas`);
}

/** Wrap an over-wide line, then clamp anything still crossing an edge. */
function fitToCanvas(c: Candidate, frame: Frame, repairs: string[]): void {
  const usable = frame.w - 2 * frame.m;
  const label = shortLabel(c.node["text"]);

  if (numOpt(c.node["maxWidth"]) === undefined) {
    const width = c.box.x1 - c.box.x0;
    let target: number | undefined;
    if (width > usable) {
      // Too wide to fit anywhere on the canvas — wrap to the usable width regardless of anchor.
      target = usable;
    } else if (c.box.x0 < 0 || c.box.x1 > frame.w) {
      const avail = availableWidth(c.node, c.originX, frame);
      if (avail >= MIN_WRAP_WIDTH && width > avail) target = avail;
    }
    if (target !== undefined && c.effSx !== 0) {
      c.node["maxWidth"] = Math.round(target / c.effSx);
      remeasure(c);
      repairs.push(`wrapped text "${label}" to maxWidth ${String(c.node["maxWidth"])}`);
    }
  }

  clampToCanvas(c, frame, repairs);
}

/** Overlap of two boxes per axis; zero or negative means they are clear on that axis. */
function overlapOf(a: Box, b: Box): { ox: number; oy: number } {
  return { ox: Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy: Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) };
}

function collides(a: Box, b: Box): boolean {
  const { ox, oy } = overlapOf(a, b);
  return ox >= MIN_COLLISION && oy >= MIN_COLLISION;
}

/** A canvas-space displacement to try. */
type Move = [ddx: number, ddy: number];

interface Placement {
  hadX: boolean;
  hadY: boolean;
  x: unknown;
  y: unknown;
  box: Box;
  originX: number;
  originY: number;
}

function placementOf(c: Candidate): Placement {
  return {
    hadX: "x" in c.node,
    hadY: "y" in c.node,
    x: c.node["x"],
    y: c.node["y"],
    box: { ...c.box },
    originX: c.originX,
    originY: c.originY,
  };
}

/** Put a candidate back exactly as it was, so a rejected direction leaves no trace. */
function restore(c: Candidate, p: Placement): void {
  if (p.hadX) c.node["x"] = p.x;
  else delete c.node["x"];
  if (p.hadY) c.node["y"] = p.y;
  else delete c.node["y"];
  c.box = p.box;
  c.originX = p.originX;
  c.originY = p.originY;
}

/**
 * Apply `move` to `c` and clamp it. Keeps the result only if `accept` is satisfied at the
 * clamped position; otherwise restores the candidate, so the next direction starts from
 * the same place.
 */
function tryMove(c: Candidate, move: Move, frame: Frame, accept: (box: Box) => boolean): boolean {
  const saved = placementOf(c);
  moveBy(c, move[0], move[1]);
  clampToCanvas(c, frame, []);
  if (accept(c.box)) return true;
  restore(c, saved);
  return false;
}

/**
 * Push each colliding pair apart along the axis of least displacement, moving the LATER
 * node in document order. Canvas containment wins: if re-clamping the moved node restores
 * the overlap, the clamp is kept and the collision is recorded but left unresolved, so the
 * pass cannot oscillate.
 */
function separate(candidates: Candidate[], occluders: Occluder[], frame: Frame, repairs: string[]): void {
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (!collides(a.box, b.box)) continue;
      // Same spot, different moments: a lesson that stacks its segment headings and
      // sequences them by opacity is not a collision, and pushing them apart wrecks it.
      if (!coVisible(a.visible, b.visible)) continue;

      const aCx = (a.box.x0 + a.box.x1) / 2;
      const bCx = (b.box.x0 + b.box.x1) / 2;
      const aCy = (a.box.y0 + a.box.y1) / 2;
      const bCy = (b.box.y0 + b.box.y1) / 2;

      // Clear past the far edge of the other box, not by the overlap: when one label's box
      // spans the other's on an axis, the overlap is the narrower box's whole width and
      // moving by it leaves them still on top of each other.
      // Ties and coincident centres resolve the same way every run: push down, or right.
      const down: Move = [0, a.box.y1 - b.box.y0 + 1];
      const up: Move = [0, a.box.y0 - b.box.y1 - 1];
      const right: Move = [a.box.x1 - b.box.x0 + 1, 0];
      const left: Move = [a.box.x0 - b.box.x1 - 1, 0];
      const vertical = bCy < aCy ? [up, down] : [down, up];
      const horizontal = bCx < aCx ? [left, right] : [right, left];
      // Least displacement first, but a direction the canvas edge would undo is no use,
      // so fall through to the opposite one and then to the other axis before conceding.
      const order = Math.abs(vertical[0]![1]) <= Math.abs(horizontal[0]![0]) ? [...vertical, ...horizontal] : [...horizontal, ...vertical];

      // Separating is not allowed to undo the artwork repair: a direction that parks the
      // label across a shape is no better than the collision it was solving.
      const accept = (box: Box): boolean => !collides(a.box, box) && !acrossAny(box, occluders);
      let resolved = false;
      for (const move of order) {
        if (tryMove(b, move, frame, accept)) {
          resolved = true;
          break;
        }
      }
      // Nothing cleared it — apply the first choice so the collision is at least reduced.
      if (!resolved) {
        moveBy(b, order[0]![0], order[0]![1]);
        clampToCanvas(b, frame, []);
      }

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

function shapeName(node: Record<string, unknown>): string {
  const id = node["id"];
  return typeof id === "string" && id.length > 0 ? `shape "${id}"` : `a ${String(node["type"])}`;
}

/**
 * Lift each label off any shape it is lying across, by the shortest move that clears every
 * one of them. Down before up and vertical before horizontal on a tie, because a label
 * under the thing it names is the idiom the author was reaching for. A move the canvas
 * clamp would undo, or that lands on other artwork, is rejected in favour of the next
 * direction; if none work the label is left where it is and the problem is reported.
 */
function clearArtwork(candidates: Candidate[], occluders: Occluder[], frame: Frame, repairs: string[]): void {
  if (occluders.length === 0) return;
  // Enough air that the glyphs do not touch the shape's edge, scaled like the margin.
  const gap = Math.max(1, Math.round(frame.m / 4));
  for (const c of candidates) {
    const across = occluders.filter((o) => liesAcross(c.box, o));
    if (across.length === 0) continue;

    const moves: Move[] = [];
    for (const o of across) {
      moves.push(
        [0, o.box.y1 + gap - c.box.y0],
        [0, o.box.y0 - gap - c.box.y1],
        [o.box.x1 + gap - c.box.x0, 0],
        [o.box.x0 - gap - c.box.x1, 0],
      );
    }
    moves.sort((m, n) => Math.hypot(m[0], m[1]) - Math.hypot(n[0], n[1]));

    const accept = (box: Box): boolean => !acrossAny(box, occluders);
    const cleared = moves.some((move) => tryMove(c, move, frame, accept));
    const label = shortLabel(c.node["text"]);
    const name = shapeName(across[0]!.node);
    repairs.push(cleared ? `moved text "${label}" clear of ${name}` : `text "${label}" still sits across ${name}`);
  }
}

/**
 * Report a label that sits wholly on a fill it cannot be read against. It is not moved:
 * the placement is deliberate — a flowchart box, a button — and what is wrong with it is
 * the colour, which this pass has no business choosing.
 */
function reportIllegibleGround(candidates: Candidate[], occluders: Occluder[], repairs: string[]): void {
  for (const c of candidates) {
    if (c.node["gradient"] !== undefined) continue;
    const raw = typeof c.node["fill"] === "string" ? c.node["fill"] : SHAPE_DEFAULTS.fill;
    const parsed = parseColor(raw);
    if (!parsed || parsed.a === 0 || c.alpha === 0) continue;

    // The last shape the label sits on is the one painted on top of the others, so it is
    // what the glyphs are actually read against.
    let under: Occluder | undefined;
    for (const o of occluders) if (o.ground !== null && sitOf(c.box, o) === "on") under = o;
    if (!under?.ground) continue;

    const seen = mix(under.ground, raw, parsed.a * c.alpha);
    const ratio = contrastRatio(seen, under.ground);
    const weightRaw = c.node["fontWeight"];
    const weight = typeof weightRaw === "number" || typeof weightRaw === "string" ? weightRaw : SHAPE_DEFAULTS.fontWeight;
    const min = wcagTextContrastMin(num(c.node["fontSize"], SHAPE_DEFAULTS.fontSize), weight);
    if (ratio >= min) continue;
    repairs.push(
      `text "${shortLabel(c.node["text"])}" reads at ${ratio.toFixed(2)}:1 against ${shapeName(under.node)} beneath it (needs ${min}:1)`,
    );
  }
}

/** The solid colour the scene is painted on, for deciding what a fill actually shows. */
function backgroundOf(spec: Record<string, unknown>): string {
  const bg = spec["background"];
  if (typeof bg === "string") return bg === "transparent" || bg === "none" ? "#ffffff" : bg;
  if (isObject(bg)) {
    const fill = bg["fill"];
    if (typeof fill === "string") return fill;
    if (isObject(fill) && Array.isArray(fill["stops"])) {
      const first: unknown = fill["stops"][0];
      if (isObject(first) && typeof first["color"] === "string") return first["color"];
    }
  }
  return "#ffffff";
}

const ROOT: Inherited = { dx: 0, dy: 0, sx: 1, sy: 1, alpha: 1, blocked: false, fading: false, visible: null };

export function fitAuthoredText(spec: unknown): TextFitResult {
  if (!isObject(spec)) return { spec, repairs: [] };
  // A camera re-maps the whole coordinate space; canvas-space reasoning is invalid.
  if (spec["camera"] !== undefined) return { spec, repairs: [] };
  const canvasW = numOpt(spec["width"]);
  const canvasH = numOpt(spec["height"]);
  if (!canvasW || !canvasH || canvasW <= 0 || canvasH <= 0) return { spec, repairs: [] };

  const clone = structuredClone(spec) as Record<string, unknown>;
  const repairs: string[] = [];
  const found: Collected = { text: [], shapes: [], background: backgroundOf(clone) };
  collect(clone["nodes"], ROOT, found);

  const frame = frameOf(canvasW, canvasH);
  for (const c of found.text) fitToCanvas(c, frame, repairs);
  clearArtwork(found.text, found.shapes, frame, repairs);
  separate(found.text, found.shapes, frame, repairs);
  reportIllegibleGround(found.text, found.shapes, repairs);

  return { spec: repairs.length > 0 ? clone : spec, repairs };
}

/** Test seam: the canvas-space box of the text node with `id`, or null. */
export function measureBoxForTest(spec: unknown, id: string): Box | null {
  if (!isObject(spec)) return null;
  const found: Collected = { text: [], shapes: [], background: backgroundOf(spec) };
  collect(spec["nodes"], ROOT, found);
  return found.text.find((c) => c.node["id"] === id)?.box ?? null;
}
