/**
 * The renderer: a pure function (spec, frameIndex) -> pixels.
 *
 * This is the property the whole system depends on. Given the same spec, frame,
 * and seed, it produces byte-identical output every time — no wall-clock, no
 * ambient randomness, no shared mutable state. That is what makes parallel shard
 * rendering and retry-on-failure safe by construction (see the plan's Concurrency
 * pillar).
 */

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import type { Node, SceneSpec } from "../spec/types.js";
import { LIMITS, SCENE_DEFAULTS, SHAPE_DEFAULTS } from "../spec/schema.js";
import { ensureFontsRegistered, DEFAULT_FONT_FAMILY, isRegisteredFamily } from "./fonts.js";
import { normalizeColor } from "./color.js";
import { makeRng, type Rng } from "./rng.js";
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
  if (bg !== "transparent") {
    ctx.fillStyle = normalizeColor(bg);
    ctx.fillRect(0, 0, width, height);
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

  const res = new NodeResolver(node, t);
  switch (node.type) {
    case "rect":
      drawRect(ctx, res);
      break;
    case "ellipse":
      drawEllipse(ctx, res);
      break;
    case "text":
      drawText(ctx, res);
      break;
    case "group":
      for (const child of node.children) {
        drawNode(rc, child, t, depth + 1);
      }
      break;
    default: {
      // Exhaustiveness guard: a node type added to the spec but not handled here
      // must fail loudly, not silently render nothing.
      const unhandled: never = node;
      throw new Error(`render: unsupported node type "${(unhandled as Node).type}"`);
    }
  }

  ctx.restore();
}

function applyFillAndStroke(
  ctx: SKRSContext2D,
  fill: string | undefined,
  stroke: string | undefined,
  strokeWidth: number,
): void {
  if (fill !== undefined && fill !== "transparent") {
    ctx.fillStyle = normalizeColor(fill);
    ctx.fill();
  }
  if (stroke !== undefined && stroke !== "transparent" && strokeWidth > 0) {
    ctx.strokeStyle = normalizeColor(stroke);
    ctx.lineWidth = strokeWidth;
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
  applyFillAndStroke(ctx, fill, stroke, strokeWidth);
}

function drawEllipse(ctx: SKRSContext2D, res: NodeResolver): void {
  const width = Math.max(0, res.num("width", SHAPE_DEFAULTS.width));
  const height = Math.max(0, res.num("height", SHAPE_DEFAULTS.height));
  const fill = res.color("fill") ?? SHAPE_DEFAULTS.fill;
  const stroke = res.color("stroke");
  const strokeWidth = Math.max(0, res.num("strokeWidth", SHAPE_DEFAULTS.strokeWidth));

  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  applyFillAndStroke(ctx, fill, stroke, strokeWidth);
}

function drawText(ctx: SKRSContext2D, res: NodeResolver): void {
  const text = res.str("text") ?? "";
  if (text.length === 0) return;
  const fontSize = Math.max(0, res.num("fontSize", SHAPE_DEFAULTS.fontSize));
  // Only render with a pinned family; fall back to the default otherwise so an
  // unregistered family can never silently pull in a host font. (The validator
  // already rejects unregistered families; this is defense in depth.)
  const requested = res.str("fontFamily") ?? DEFAULT_FONT_FAMILY;
  const family = isRegisteredFamily(requested) ? requested : DEFAULT_FONT_FAMILY;
  const weightRaw = res.raw("fontWeight");
  const weight = typeof weightRaw === "number" || typeof weightRaw === "string" ? weightRaw : SHAPE_DEFAULTS.fontWeight;
  const fill = res.color("fill") ?? SHAPE_DEFAULTS.fill;
  const stroke = res.color("stroke");
  const strokeWidth = Math.max(0, res.num("strokeWidth", SHAPE_DEFAULTS.strokeWidth));

  ctx.font = `${weight} ${fontSize}px "${family}"`;
  ctx.textAlign = (res.str("align") as TextAlign) ?? "left";
  ctx.textBaseline = (res.str("baseline") as TextBaseline) ?? "top";

  if (fill !== undefined && fill !== "transparent") {
    ctx.fillStyle = normalizeColor(fill);
    ctx.fillText(text, 0, 0);
  }
  if (stroke !== undefined && stroke !== "transparent" && strokeWidth > 0) {
    ctx.strokeStyle = normalizeColor(stroke);
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, 0, 0);
  }
}
