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

/** Every supported node type. */
export const NODE_TYPES: readonly NodeType[] = ["rect", "ellipse", "text", "group"];

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
  strokeWidth: "number",
  fontSize: "number",
  fill: "color",
  stroke: "color",
};

/** Transform properties common to all node types. */
const COMMON_KEYS = [
  "id",
  "type",
  "x",
  "y",
  "rotation",
  "scale",
  "scaleX",
  "scaleY",
  "opacity",
  "anchor",
  "tracks",
] as const;

/**
 * The full set of allowed keys per node type. Any key outside this set is reported
 * as `UNKNOWN_PROPERTY` — this is what lets an authoring agent catch `colour` vs
 * `color` before it ever renders.
 */
export const ALLOWED_KEYS: Readonly<Record<NodeType, readonly string[]>> = {
  rect: [...COMMON_KEYS, "width", "height", "fill", "stroke", "strokeWidth", "radius"],
  ellipse: [...COMMON_KEYS, "width", "height", "fill", "stroke", "strokeWidth"],
  text: [
    ...COMMON_KEYS,
    "text",
    "fontSize",
    "fontFamily",
    "fontWeight",
    "align",
    "baseline",
    "fill",
    "stroke",
    "strokeWidth",
  ],
  group: [...COMMON_KEYS, "children"],
};

/** Which animatable properties are valid targets for a track, per node type. */
export const ANIMATABLE_BY_TYPE: Readonly<Record<NodeType, readonly string[]>> = {
  rect: ["x", "y", "rotation", "scale", "scaleX", "scaleY", "opacity", "width", "height", "radius", "strokeWidth", "fill", "stroke"],
  ellipse: ["x", "y", "rotation", "scale", "scaleX", "scaleY", "opacity", "width", "height", "strokeWidth", "fill", "stroke"],
  text: ["x", "y", "rotation", "scale", "scaleX", "scaleY", "opacity", "fontSize", "strokeWidth", "fill", "stroke"],
  group: ["x", "y", "rotation", "scale", "scaleX", "scaleY", "opacity"],
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
