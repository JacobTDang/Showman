/**
 * Machine-readable description of the Scene Spec: the current version, the set of
 * node types, which properties are animatable (and their value kind), the allowed
 * keys per node type (used to catch typos), and engine limits.
 *
 * This is the single source of truth the validator and the resolver both read, so
 * the contract cannot drift between "what validates" and "what renders".
 */

import type { NodeType } from "./types.js";

/** The schema version this engine speaks. A spec's `specVersion` must equal this. */
export const SPEC_VERSION = 1 as const;

/**
 * The font families the engine ships and pins. A spec may only use these for
 * `fontFamily`; anything else would fall back to host system fonts and break
 * cross-machine determinism, so the validator rejects it. `engine/fonts.ts` maps
 * these names to the bundled font files and registers exactly them.
 */
export const REGISTERED_FONT_FAMILIES = ["Nunito", "Fredoka"] as const;

/** Every supported node type. */
export const NODE_TYPES: readonly NodeType[] = ["rect", "ellipse", "polygon", "polyline", "path", "arc", "counter", "text", "group"];

/** The kind of value an animatable property carries. */
export type PropertyKind = "number" | "color";

/**
 * Every animatable property and its value kind. The resolver interpolates based on
 * this, and the validator type-checks keyframe values against it.
 */
export const ANIMATABLE_PROPERTIES: Readonly<Record<string, PropertyKind>> = {
  // transform (all nodes)
  x: "number",
  y: "number",
  rotation: "number",
  scale: "number",
  scaleX: "number",
  scaleY: "number",
  opacity: "number",
  // shape geometry / paint
  width: "number",
  height: "number",
  radius: "number",
  innerRadius: "number",
  startAngle: "number",
  endAngle: "number",
  value: "number",
  progress: "number",
  morph: "number",
  strokeWidth: "number",
  fontSize: "number",
  reveal: "number",
  fill: "color",
  stroke: "color",
};

/** Transform properties common to all node types. */
const COMMON_KEYS = ["id", "type", "x", "y", "rotation", "scale", "scaleX", "scaleY", "opacity", "anchor", "tracks"] as const;

/**
 * The full set of allowed keys per node type. Any key outside this set is reported
 * as `UNKNOWN_PROPERTY` — this is what lets an authoring agent catch `colour` vs
 * `color` before it ever renders.
 */
export const ALLOWED_KEYS: Readonly<Record<NodeType, readonly string[]>> = {
  rect: [...COMMON_KEYS, "width", "height", "fill", "stroke", "strokeWidth", "radius"],
  ellipse: [...COMMON_KEYS, "width", "height", "fill", "stroke", "strokeWidth"],
  polygon: [...COMMON_KEYS, "sides", "radius", "innerRadius", "fill", "stroke", "strokeWidth"],
  polyline: [...COMMON_KEYS, "points", "stroke", "strokeWidth", "fill", "closed", "lineCap", "lineJoin", "progress", "morphTo", "morph"],
  path: [...COMMON_KEYS, "d", "fill", "stroke", "strokeWidth", "fillRule", "lineCap", "lineJoin", "progress"],
  arc: [...COMMON_KEYS, "radius", "innerRadius", "startAngle", "endAngle", "fill", "stroke", "strokeWidth"],
  counter: [
    ...COMMON_KEYS,
    "value",
    "decimals",
    "prefix",
    "suffix",
    "fontSize",
    "fontFamily",
    "fontWeight",
    "align",
    "baseline",
    "fill",
    "stroke",
    "strokeWidth",
  ],
  text: [...COMMON_KEYS, "text", "reveal", "fontSize", "fontFamily", "fontWeight", "align", "baseline", "fill", "stroke", "strokeWidth"],
  group: [...COMMON_KEYS, "children"],
};

/** Which animatable properties are valid targets for a track, per node type. */
const TRANSFORM_ANIM = ["x", "y", "rotation", "scale", "scaleX", "scaleY", "opacity"];
export const ANIMATABLE_BY_TYPE: Readonly<Record<NodeType, readonly string[]>> = {
  rect: [...TRANSFORM_ANIM, "width", "height", "radius", "strokeWidth", "fill", "stroke"],
  ellipse: [...TRANSFORM_ANIM, "width", "height", "strokeWidth", "fill", "stroke"],
  polygon: [...TRANSFORM_ANIM, "radius", "innerRadius", "strokeWidth", "fill", "stroke"],
  polyline: [...TRANSFORM_ANIM, "strokeWidth", "progress", "morph", "fill", "stroke"],
  path: [...TRANSFORM_ANIM, "strokeWidth", "progress", "fill", "stroke"],
  arc: [...TRANSFORM_ANIM, "radius", "innerRadius", "startAngle", "endAngle", "strokeWidth", "fill", "stroke"],
  counter: [...TRANSFORM_ANIM, "value", "fontSize", "strokeWidth", "fill", "stroke"],
  text: [...TRANSFORM_ANIM, "fontSize", "reveal", "strokeWidth", "fill", "stroke"],
  group: [...TRANSFORM_ANIM],
};

/** Default base-transform values applied when a property is absent. */
export const TRANSFORM_DEFAULTS = {
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  opacity: 1,
  anchorX: 0,
  anchorY: 0,
} as const;

/** Default scene-level values. */
export const SCENE_DEFAULTS = {
  seed: 0,
  background: "#ffffff",
} as const;

/** Default shape values. */
export const SHAPE_DEFAULTS = {
  width: 100,
  height: 100,
  fill: "#000000",
  strokeWidth: 0,
  radius: 0,
  fontSize: 48,
  fontFamily: "Nunito",
  fontWeight: 400,
} as const;

/**
 * Engine limits. M0 uses these only to reject obviously-broken specs with a clear
 * message; M6 tightens them into per-user quota enforcement at the gateway.
 */
export const LIMITS = {
  maxWidth: 7680,
  maxHeight: 4320,
  minFps: 1,
  maxFps: 120,
  maxDuration: 600, // seconds
  maxFrames: 36_000, // hard cap on total frames (farm protection, enforced at validation)
  maxNodes: 10_000,
  maxTreeDepth: 32,
} as const;

/** Named easing curves the engine understands (mirrors EasingName in types.ts). */
export const EASING_NAMES: readonly string[] = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "easeOutElastic",
  "easeOutBounce",
];

/** Total number of frames a scene renders to. Frame indices are `0 .. totalFrames-1`. */
export function totalFrames(fps: number, duration: number): number {
  return Math.max(1, Math.round(duration * fps));
}
