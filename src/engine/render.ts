/**
 * The renderer: a pure function (spec, frameIndex) -> pixels.
 *
 * This is the property the whole system depends on. Given the same spec, frame,
 * and seed, it produces byte-identical output every time — no wall-clock, no
 * ambient randomness, no shared mutable state. That is what makes parallel shard
 * rendering and retry-on-failure safe by construction (see the plan's Concurrency
 * pillar).
 */

import { createCanvas, Path2D, type SKRSContext2D } from "@napi-rs/canvas";
import { flattenPath } from "./svgPath.js";
import { getRegisteredImage } from "./imageRegistry.js";
import type { Node, SceneSpec, Gradient, Shadow, Backdrop } from "../spec/types.js";
import { LIMITS, SCENE_DEFAULTS, SHAPE_DEFAULTS } from "../spec/schema.js";
import { ensureFontsRegistered, DEFAULT_FONT_FAMILY, isRegisteredFamily } from "./fonts.js";
import { normalizeColor } from "./color.js";
import { wrapText } from "./textLayout.js";
import { makeRng, hashSeed, type Rng } from "./rng.js";
import { NodeResolver, resolveTransform } from "./resolve.js";

/** The result of rendering one frame. */
export interface RenderResult {
  width: number;
  height: number;
  /** The frame index that was rendered. */
  frameIndex: number;
  /** Scene time in seconds for this frame (`frameIndex / fps`). */
  time: number;
  /** Raw RGBA pixels, length `width * height * 4`. The primary output (fed to FFmpeg in M1). */
  pixels: Uint8ClampedArray;
  /** Encode the frame as PNG (used for previews; lazy so we don't pay for it unless asked). */
  toPNG(): Buffer;
}

interface RenderContext {
  ctx: SKRSContext2D;
  rng: Rng;
}

const DEG2RAD = Math.PI / 180;

type TextAlign = "left" | "right" | "center" | "start" | "end";
type TextBaseline = "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
type LineCap = "butt" | "round" | "square";
type LineJoin = "miter" | "round" | "bevel";

/**
 * Render a single frame of `spec` at `frameIndex`. Frame indices are
 * `0 .. totalFrames-1`; time is `frameIndex / fps` seconds.
 *
 * Assumes a valid spec — validate with the validator before rendering at scale.
 */
export function renderFrame(spec: SceneSpec, frameIndex: number): RenderResult {
  ensureFontsRegistered();

  const width = spec.width;
  const height = spec.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`renderFrame: invalid dimensions ${width}x${height}`);
  }
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error(`renderFrame: frameIndex must be a non-negative integer, got ${frameIndex}`);
  }

  const time = frameIndex / spec.fps;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background.
  const bg = spec.background ?? SCENE_DEFAULTS.background;
  if (typeof bg === "string") {
    if (bg !== "transparent") {
      ctx.fillStyle = normalizeColor(bg);
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    drawBackdrop(ctx, bg, width, height, spec.seed ?? SCENE_DEFAULTS.seed, frameIndex);
  }

  // The seed seam: all randomness derives from here, never from Math.random/Date.
  const rng = makeRng(spec.seed ?? SCENE_DEFAULTS.seed);
  const rc: RenderContext = { ctx, rng };

  for (const node of spec.nodes) {
    drawNode(rc, node, time, 0);
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  return {
    width,
    height,
    frameIndex,
    time,
    pixels: imageData.data,
    toPNG: () => canvas.toBuffer("image/png"),
  };
}

/** Draw a node (and its subtree) at time `t`, applying its transform. */
type CompositeOp = SKRSContext2D["globalCompositeOperation"];
/** Friendly blend-mode names → canvas composite operations (normal is the default, omitted). */
const BLEND_MAP: Record<string, CompositeOp> = {
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  add: "lighter",
  difference: "difference",
  exclusion: "exclusion",
  "soft-light": "soft-light",
  "hard-light": "hard-light",
  "color-dodge": "color-dodge",
  "color-burn": "color-burn",
};

function drawNode(rc: RenderContext, node: Node, t: number, depth: number): void {
  if (depth > LIMITS.maxTreeDepth) {
    throw new Error(`scene tree exceeds max depth ${LIMITS.maxTreeDepth} at node "${node.id}"`);
  }
  const { ctx } = rc;
  const tf = resolveTransform(node, t);

  // Fully transparent subtrees contribute nothing; skip (also a cheap perf win).
  if (tf.opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * tf.opacity;
  ctx.translate(tf.x, tf.y);
  if (tf.rotation !== 0 || tf.scaleX !== 1 || tf.scaleY !== 1) {
    ctx.translate(tf.anchorX, tf.anchorY);
    ctx.rotate(tf.rotation * DEG2RAD);
    ctx.scale(tf.scaleX, tf.scaleY);
    ctx.translate(-tf.anchorX, -tf.anchorY);
  }
  // Compositing: blend mode + (animatable) blur apply to this node and its subtree.
  if (node.blend && node.blend !== "normal" && BLEND_MAP[node.blend]) ctx.globalCompositeOperation = BLEND_MAP[node.blend]!;
  const res = new NodeResolver(node, t);
  // Clamp like every other geometric input: a non-finite or huge blur must degrade to a no-op,
  // never reach ctx.filter (where "blur(NaNpx)" / an enormous radius can crash the process).
  const blurPx = res.num("blur", 0);
  if (Number.isFinite(blurPx) && blurPx > 0) ctx.filter = `blur(${Math.min(blurPx, 200)}px)`;
  // Drop shadow / glow (on a group: applies to each child). Auto-resets on ctx.restore().
  if (node.shadow) applyShadow(ctx, node.shadow);
  switch (node.type) {
    case "rect":
      drawRect(ctx, res);
      break;
    case "ellipse":
      drawEllipse(ctx, res);
      break;
    case "polygon":
      drawPolygon(ctx, res);
      break;
    case "polyline":
      drawPolyline(ctx, res);
      break;
    case "path":
      drawPath(ctx, res);
      break;
    case "image":
      drawImage(ctx, res);
      break;
    case "arc":
      drawArc(ctx, res);
      break;
    case "counter":
      drawCounter(ctx, res);
      break;
    case "text":
      drawText(ctx, res);
      break;
    case "group": {
      if (node.clip) {
        const { width, height } = node.clip;
        const r = Math.min(Math.max(0, node.clip.radius ?? 0), width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(width, 0, width, height, r);
        ctx.arcTo(width, height, 0, height, r);
        ctx.arcTo(0, height, 0, 0, r);
        ctx.arcTo(0, 0, width, 0, r);
        ctx.closePath();
        ctx.clip();
      }
      for (const child of node.children) {
        drawNode(rc, child, t, depth + 1);
      }
      break;
    }
    default: {
      // Exhaustiveness guard: a node type added to the spec but not handled here
      // must fail loudly, not silently render nothing.
      const unhandled: never = node;
      throw new Error(`render: unsupported node type "${(unhandled as Node).type}"`);
    }
  }

  ctx.restore();
}

/** Paint a rich scene background: base fill (color or gradient) + vignette + seeded film grain. */
function drawBackdrop(ctx: SKRSContext2D, bd: Backdrop, width: number, height: number, seed: number, frameIndex: number): void {
  const fill = bd.fill ?? "#ffffff";
  if (typeof fill === "string") {
    if (fill !== "transparent") {
      ctx.fillStyle = normalizeColor(fill);
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    ctx.fillStyle = buildGradient(ctx, fill);
    ctx.fillRect(0, 0, width, height);
  }

  const vig = bd.vignette ?? 0;
  if (Number.isFinite(vig) && vig > 0) {
    const v = Math.min(1, vig);
    const cx = width / 2;
    const cy = height / 2;
    const g = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.3, cx, cy, Math.hypot(cx, cy));
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(1, `rgba(0, 0, 0, ${v})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  const grain = bd.grain ?? 0;
  if (Number.isFinite(grain) && grain > 0) {
    applyGrain(ctx, width, height, makeRng(hashSeed(Math.floor(seed), frameIndex)), Math.min(1, grain));
  }
}

/** Add monochrome film grain via a seeded RNG. Pure integer pixel math → byte-identical across
 * platforms; per-frame seed gives natural flicker. */
function applyGrain(ctx: SKRSContext2D, width: number, height: number, rng: Rng, strength: number): void {
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  const amp = strength * 32; // up to ±32 levels at full strength
  for (let i = 0; i < data.length; i += 4) {
    const n = Math.round((rng.next() * 2 - 1) * amp);
    data[i] = data[i]! + n; // Uint8ClampedArray clamps to [0, 255]
    data[i + 1] = data[i + 1]! + n;
    data[i + 2] = data[i + 2]! + n;
  }
  ctx.putImageData(img, 0, 0);
}

/** The Skia gradient type (@napi-rs/canvas doesn't export it by name). */
type SkGradient = ReturnType<SKRSContext2D["createLinearGradient"]>;

/** Build a Skia gradient from a spec (local coordinates). Stops are clamped to [0,1]. Inner-circle
 * fields are coerced to safe values (defense-in-depth: never pass NaN/undefined to Skia). */
function buildGradient(ctx: SKRSContext2D, g: Gradient): SkGradient {
  let grad: SkGradient;
  if (g.type === "linear") {
    grad = ctx.createLinearGradient(g.from.x, g.from.y, g.to.x, g.to.y);
  } else {
    const ic = g.innerCenter && Number.isFinite(g.innerCenter.x) && Number.isFinite(g.innerCenter.y) ? g.innerCenter : g.center;
    const ir = Number.isFinite(g.innerRadius) ? Math.max(0, g.innerRadius!) : 0;
    grad = ctx.createRadialGradient(ic.x, ic.y, ir, g.center.x, g.center.y, Math.max(0, g.radius));
  }
  for (const s of g.stops) grad.addColorStop(Math.max(0, Math.min(1, s.offset)), normalizeColor(s.color));
  return grad;
}

/** The fill style for a node: its gradient when present, else the solid fill color (or undefined). */
function resolveFillStyle(ctx: SKRSContext2D, res: NodeResolver, fill: string | undefined): string | SkGradient | undefined {
  const g = res.raw("gradient");
  if (g && typeof g === "object") return buildGradient(ctx, g as Gradient);
  return fill === undefined || fill === "transparent" ? undefined : normalizeColor(fill);
}

/** Set the canvas shadow state for a node (cleared by the surrounding ctx.restore()). */
function applyShadow(ctx: SKRSContext2D, s: Shadow): void {
  ctx.shadowColor = normalizeColor(s.color ?? "rgba(0, 0, 0, 0.35)");
  const blur = s.blur ?? 0;
  ctx.shadowBlur = Number.isFinite(blur) ? Math.max(0, Math.min(blur, 200)) : 0;
  const ox = s.offsetX ?? 0;
  const oy = s.offsetY ?? 0;
  ctx.shadowOffsetX = Number.isFinite(ox) ? ox : 0;
  ctx.shadowOffsetY = Number.isFinite(oy) ? oy : 0;
}

/** Apply a stroke dash pattern if the node declares a valid one (otherwise leave solid). Requires at
 * least one positive entry — an all-zero pattern crashes Skia — and a sane total to avoid a tiny-dash
 * segment-count blowup (defense-in-depth; the validator already rejects these). */
function applyDash(ctx: SKRSContext2D, res: NodeResolver): void {
  const dash = res.raw("dash");
  if (!Array.isArray(dash) || dash.length === 0) return;
  if (!dash.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) return;
  const sum = (dash as number[]).reduce((a, b) => a + b, 0);
  if (!dash.some((n) => (n as number) > 0) || sum < 1) return;
  ctx.setLineDash(dash as number[]);
  const off = res.num("dashOffset", 0);
  ctx.lineDashOffset = Number.isFinite(off) ? off : 0;
}

function applyFillAndStroke(
  ctx: SKRSContext2D,
  res: NodeResolver,
  fill: string | undefined,
  stroke: string | undefined,
  strokeWidth: number,
): void {
  const fillStyle = resolveFillStyle(ctx, res, fill);
  if (fillStyle !== undefined) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (stroke !== undefined && stroke !== "transparent" && strokeWidth > 0) {
    ctx.strokeStyle = normalizeColor(stroke);
    ctx.lineWidth = strokeWidth;
    applyDash(ctx, res);
    ctx.stroke();
  }
}

function drawRect(ctx: SKRSContext2D, res: NodeResolver): void {
  // Clamp geometry: animated tracks can sample negative values that static
  // validation can't catch, and negative width/height is meaningless.
  const width = Math.max(0, res.num("width", SHAPE_DEFAULTS.width));
  const height = Math.max(0, res.num("height", SHAPE_DEFAULTS.height));
  const radius = Math.max(0, Math.min(res.num("radius", SHAPE_DEFAULTS.radius), Math.min(width, height) / 2));
  const fill = res.color("fill") ?? SHAPE_DEFAULTS.fill;
  const stroke = res.color("stroke");
  const strokeWidth = Math.max(0, res.num("strokeWidth", SHAPE_DEFAULTS.strokeWidth));

  ctx.beginPath();
  if (radius > 0) {
    ctx.roundRect(0, 0, width, height, radius);
  } else {
    ctx.rect(0, 0, width, height);
  }
  applyFillAndStroke(ctx, res, fill, stroke, strokeWidth);
}

function drawEllipse(ctx: SKRSContext2D, res: NodeResolver): void {
  const width = Math.max(0, res.num("width", SHAPE_DEFAULTS.width));
  const height = Math.max(0, res.num("height", SHAPE_DEFAULTS.height));
  const fill = res.color("fill") ?? SHAPE_DEFAULTS.fill;
  const stroke = res.color("stroke");
  const strokeWidth = Math.max(0, res.num("strokeWidth", SHAPE_DEFAULTS.strokeWidth));

  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  applyFillAndStroke(ctx, res, fill, stroke, strokeWidth);
}

function drawPolygon(ctx: SKRSContext2D, res: NodeResolver): void {
  const sidesRaw = res.raw("sides");
  const sides = Math.max(3, typeof sidesRaw === "number" ? Math.floor(sidesRaw) : 3);
  const radius = Math.max(0, res.num("radius", 50));
  const innerRaw = res.numOpt("innerRadius");
  const fill = res.color("fill") ?? SHAPE_DEFAULTS.fill;
  const stroke = res.color("stroke");
  const strokeWidth = Math.max(0, res.num("strokeWidth", SHAPE_DEFAULTS.strokeWidth));
  const cx = radius;
  const cy = radius;

  ctx.beginPath();
  if (innerRaw !== undefined && innerRaw >= 0) {
    // Star: alternate outer/inner radius over 2*sides points.
    const inner = Math.max(0, innerRaw);
    const points = sides * 2;
    for (let i = 0; i < points; i++) {
      const r = i % 2 === 0 ? radius : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / sides;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else {
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
      const x = cx + radius * Math.cos(a);
      const y = cy + radius * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  applyFillAndStroke(ctx, res, fill, stroke, strokeWidth);
}

interface GlyphDefaults {
  weight: number | string;
  align: TextAlign;
  baseline: TextBaseline;
}

/** Paint a string with the node's resolved font/paint props. Shared by text + counter. */
/** Paint one line at vertical offset `y` (the single-line behavior, hoisted so multi-line reuses it). */
function paintLine(
  ctx: SKRSContext2D,
  str: string,
  y: number,
  fillStyle: string | SkGradient | undefined,
  stroke: string | undefined,
  strokeWidth: number,
): void {
  if (fillStyle !== undefined) {
    ctx.fillStyle = fillStyle;
    ctx.fillText(str, 0, y);
  }
  if (stroke !== undefined && stroke !== "transparent" && strokeWidth > 0) {
    ctx.strokeStyle = normalizeColor(stroke);
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(str, 0, y);
  }
}

function paintGlyphs(ctx: SKRSContext2D, res: NodeResolver, str: string, defaults: GlyphDefaults): void {
  const fontSize = Math.max(0, res.num("fontSize", SHAPE_DEFAULTS.fontSize));
  // Only render with a pinned family; fall back to the default otherwise so an
  // unregistered family can never silently pull in a host font (defense in depth;
  // the validator already rejects unregistered families).
  const requested = res.str("fontFamily") ?? DEFAULT_FONT_FAMILY;
  const family = isRegisteredFamily(requested) ? requested : DEFAULT_FONT_FAMILY;
  const weightRaw = res.raw("fontWeight");
  const weight = typeof weightRaw === "number" || typeof weightRaw === "string" ? weightRaw : defaults.weight;
  const fill = res.color("fill") ?? SHAPE_DEFAULTS.fill;
  const stroke = res.color("stroke");
  const strokeWidth = Math.max(0, res.num("strokeWidth", SHAPE_DEFAULTS.strokeWidth));

  ctx.font = `${weight} ${fontSize}px "${family}"`;
  ctx.textAlign = (res.str("align") as TextAlign) ?? defaults.align;
  ctx.textBaseline = (res.str("baseline") as TextBaseline) ?? defaults.baseline;

  const letterSpacing = res.num("letterSpacing", 0);
  const hasLetterSpacing = Number.isFinite(letterSpacing) && letterSpacing !== 0;
  if (hasLetterSpacing) ctx.letterSpacing = `${letterSpacing}px`;

  // A gradient (if present) overrides the solid fill, like shapes; else the resolved fill color.
  const fillStyle = resolveFillStyle(ctx, res, fill);

  const maxWidth = res.numOpt("maxWidth");
  // Fast path: a single line with no wrapping is painted exactly as before (byte-identical).
  if (!str.includes("\n") && (maxWidth === undefined || !(maxWidth > 0))) {
    paintLine(ctx, str, 0, fillStyle, stroke, strokeWidth);
  } else {
    const lines = wrapText(str, maxWidth, (s) => ctx.measureText(s).width);
    const lineHeightPx = Math.max(0, res.num("lineHeight", 1.25)) * fontSize;
    const n = lines.length;
    const base = ctx.textBaseline;
    // Position the block so the chosen baseline still anchors at the node origin.
    const y0 = base === "middle" ? -((n - 1) / 2) * lineHeightPx : base === "bottom" || base === "alphabetic" ? -(n - 1) * lineHeightPx : 0;
    for (let i = 0; i < n; i++) paintLine(ctx, lines[i]!, y0 + i * lineHeightPx, fillStyle, stroke, strokeWidth);
  }

  if (hasLetterSpacing) ctx.letterSpacing = "0px"; // reset shared ctx state
}

function drawText(ctx: SKRSContext2D, res: NodeResolver): void {
  let text = res.str("text") ?? "";
  if (text.length === 0) return;
  // Typewriter reveal: show only the first round(reveal * length) characters.
  const reveal = res.numOpt("reveal");
  if (reveal !== undefined) {
    const visible = Math.max(0, Math.min(text.length, Math.round(reveal * text.length)));
    text = text.slice(0, visible);
    if (text.length === 0) return;
  }
  paintGlyphs(ctx, res, text, { weight: SHAPE_DEFAULTS.fontWeight, align: "left", baseline: "top" });
}

function drawCounter(ctx: SKRSContext2D, res: NodeResolver): void {
  const value = res.num("value", 0);
  const decimalsRaw = res.raw("decimals");
  const decimals = typeof decimalsRaw === "number" ? Math.max(0, Math.floor(decimalsRaw)) : 0;
  const prefix = res.str("prefix") ?? "";
  const suffix = res.str("suffix") ?? "";
  const str = `${prefix}${value.toFixed(decimals)}${suffix}`;
  paintGlyphs(ctx, res, str, { weight: 700, align: "center", baseline: "middle" });
}

function drawPolyline(ctx: SKRSContext2D, res: NodeResolver): void {
  const raw = res.raw("points");
  if (!Array.isArray(raw) || raw.length < 2) return;
  let points = raw as Array<{ x: number; y: number }>;
  // Shape morph: lerp each point toward its morphTo counterpart by `morph` (0..1).
  const morph = Math.max(0, Math.min(1, res.num("morph", 0)));
  const morphTo = res.raw("morphTo");
  if (morph > 0 && Array.isArray(morphTo) && morphTo.length === points.length) {
    const to = morphTo as Array<{ x: number; y: number }>;
    points = points.map((p, i) => ({ x: p.x + (to[i]!.x - p.x) * morph, y: p.y + (to[i]!.y - p.y) * morph }));
  }
  const stroke = res.color("stroke") ?? "#000000";
  const strokeWidth = Math.max(0, res.num("strokeWidth", 2));
  const fill = res.color("fill");
  const closed = res.raw("closed") === true;
  const progress = Math.max(0, Math.min(1, res.num("progress", 1)));
  if (progress <= 0) return;

  // Vertices to walk, including the closing edge for a closed path.
  const verts = closed ? [...points, points[0]!] : points;
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < verts.length; i++) {
    const l = Math.hypot(verts[i]!.x - verts[i - 1]!.x, verts[i]!.y - verts[i - 1]!.y);
    segLen.push(l);
    total += l;
  }

  ctx.lineCap = (res.str("lineCap") as LineCap) ?? "round";
  ctx.lineJoin = (res.str("lineJoin") as LineJoin) ?? "round";
  ctx.lineWidth = strokeWidth;

  // Build the stroked path up to `progress` of the total length (draw-on).
  const target = progress * total;
  ctx.beginPath();
  ctx.moveTo(verts[0]!.x, verts[0]!.y);
  let acc = 0;
  for (let i = 1; i < verts.length; i++) {
    const l = segLen[i - 1]!;
    if (total === 0 || acc + l <= target) {
      ctx.lineTo(verts[i]!.x, verts[i]!.y);
      acc += l;
    } else {
      const f = l > 0 ? (target - acc) / l : 0;
      ctx.lineTo(verts[i - 1]!.x + (verts[i]!.x - verts[i - 1]!.x) * f, verts[i - 1]!.y + (verts[i]!.y - verts[i - 1]!.y) * f);
      break;
    }
  }

  // Fill a closed shape only once fully drawn (the outline animates on, then fills).
  if (closed && progress >= 1) {
    const fs = resolveFillStyle(ctx, res, fill);
    if (fs !== undefined) {
      ctx.fillStyle = fs;
      ctx.fill();
    }
  }
  if (stroke !== "transparent" && strokeWidth > 0) {
    ctx.strokeStyle = normalizeColor(stroke);
    applyDash(ctx, res);
    ctx.stroke();
  }
}

function drawPath(ctx: SKRSContext2D, res: NodeResolver): void {
  const d = res.raw("d");
  if (typeof d !== "string" || d.trim() === "") return;
  const fill = res.color("fill");
  const hasGradient = typeof res.raw("gradient") === "object" && res.raw("gradient") !== null;
  const stroke = res.color("stroke") ?? (fill === undefined && !hasGradient ? "#000000" : undefined);
  const strokeWidth = Math.max(0, res.num("strokeWidth", 2));
  const progress = Math.max(0, Math.min(1, res.num("progress", 1)));
  if (progress <= 0) return;
  ctx.lineCap = (res.str("lineCap") as LineCap) ?? "round";
  ctx.lineJoin = (res.str("lineJoin") as LineJoin) ?? "round";
  ctx.lineWidth = strokeWidth;

  // Fully drawn: crisp Skia fill + stroke straight from the path data.
  if (progress >= 1) {
    let path: Path2D;
    try {
      path = new Path2D(d);
    } catch {
      return; // malformed path data — render nothing rather than throw
    }
    const fs = resolveFillStyle(ctx, res, fill);
    if (fs !== undefined) {
      ctx.fillStyle = fs;
      ctx.fill(path, res.raw("fillRule") === "evenodd" ? "evenodd" : "nonzero");
    }
    if (stroke !== undefined && stroke !== "transparent" && strokeWidth > 0) {
      ctx.strokeStyle = normalizeColor(stroke);
      applyDash(ctx, res);
      ctx.stroke(path);
    }
    return;
  }

  // Draw-on (progress < 1): flatten the path and stroke the first `progress` of its length
  // (the "handwriting" effect); fill is withheld until fully drawn.
  if (stroke === undefined || stroke === "transparent" || strokeWidth <= 0) return;
  const subpaths = flattenPath(d);
  let total = 0;
  for (const sp of subpaths)
    for (let i = 1; i < sp.length; i++) {
      const l = Math.hypot(sp[i]!.x - sp[i - 1]!.x, sp[i]!.y - sp[i - 1]!.y);
      if (Number.isFinite(l)) total += l; // a stray non-finite point can't wipe the whole stroke
    }
  const target = progress * total;
  ctx.strokeStyle = normalizeColor(stroke);
  applyDash(ctx, res);
  ctx.beginPath();
  let acc = 0;
  for (const sp of subpaths) {
    if (sp.length < 2) continue;
    ctx.moveTo(sp[0]!.x, sp[0]!.y);
    let done = false;
    for (let i = 1; i < sp.length; i++) {
      const l = Math.hypot(sp[i]!.x - sp[i - 1]!.x, sp[i]!.y - sp[i - 1]!.y);
      if (!Number.isFinite(l)) continue; // skip a degenerate segment rather than break the reveal
      if (acc + l <= target) {
        ctx.lineTo(sp[i]!.x, sp[i]!.y);
        acc += l;
      } else {
        const f = l > 0 ? (target - acc) / l : 0;
        ctx.lineTo(sp[i - 1]!.x + (sp[i]!.x - sp[i - 1]!.x) * f, sp[i - 1]!.y + (sp[i]!.y - sp[i - 1]!.y) * f);
        done = true;
        break;
      }
    }
    if (done) break;
  }
  ctx.stroke();
}

function drawImage(ctx: SKRSContext2D, res: NodeResolver): void {
  const src = res.raw("src");
  if (typeof src !== "string") return;
  const img = getRegisteredImage(src);
  if (!img) return; // not decoded (missing / undecodable) — render nothing
  const w = Math.max(0, res.num("width", img.width));
  const h = Math.max(0, res.num("height", img.height));
  if (w === 0 || h === 0) return;
  const fit = (res.str("fit") as "fill" | "contain" | "cover") ?? "fill";
  const radius = Math.min(Math.max(0, res.num("radius", 0)), w / 2, h / 2);

  ctx.save();
  // Clip to the (optionally rounded) box for rounded corners or a `cover` overflow.
  if (radius > 0 || fit === "cover") {
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.arcTo(w, 0, w, h, radius);
    ctx.arcTo(w, h, 0, h, radius);
    ctx.arcTo(0, h, 0, 0, radius);
    ctx.arcTo(0, 0, w, 0, radius);
    ctx.closePath();
    ctx.clip();
  }
  if (fit === "fill") {
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    const iw = img.width || w;
    const ih = img.height || h;
    const scale = fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  ctx.restore();
}

function drawArc(ctx: SKRSContext2D, res: NodeResolver): void {
  const radius = Math.max(0, res.num("radius", 50));
  const inner = Math.max(0, Math.min(res.num("innerRadius", 0), radius));
  const startDeg = res.num("startAngle", 0);
  const endDeg = res.num("endAngle", 360);
  const fill = res.color("fill") ?? SHAPE_DEFAULTS.fill;
  const stroke = res.color("stroke");
  const strokeWidth = Math.max(0, res.num("strokeWidth", SHAPE_DEFAULTS.strokeWidth));
  const cx = radius;
  const cy = radius;

  // Degrees clockwise from 12 o'clock -> canvas radians (0 = 3 o'clock, +cw).
  const toRad = (d: number): number => ((d - 90) * Math.PI) / 180;
  const sweep = endDeg - startDeg;
  if (Math.abs(sweep) < 1e-6) return; // nothing to draw (e.g. a fraction at 0)
  const full = Math.abs(sweep) >= 360;
  const a0 = toRad(startDeg);
  const a1 = toRad(endDeg);
  const ccw = a1 < a0;

  ctx.beginPath();
  if (full) {
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    if (inner > 0) ctx.arc(cx, cy, inner, 0, Math.PI * 2, true); // hole (ring)
  } else if (inner > 0) {
    // Annular sector: outer arc forward, inner arc back.
    ctx.arc(cx, cy, radius, a0, a1, ccw);
    ctx.arc(cx, cy, inner, a1, a0, !ccw);
    ctx.closePath();
  } else {
    // Pie slice: center -> outer arc -> close.
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, a0, a1, ccw);
    ctx.closePath();
  }
  applyFillAndStroke(ctx, res, fill, stroke, strokeWidth);
}
