/**
 * Showman engine — public API (M0).
 *
 * The deterministic core: a Scene Spec contract, a structured validator, and a
 * pure `(spec, frame) -> pixels` renderer. Later milestones wrap this in a
 * container (M1), distribute it (M3), and expose it to agents (M4).
 */

// The contract
export type {
  SceneSpec,
  Node,
  NodeType,
  RectNode,
  EllipseNode,
  TextNode,
  GroupNode,
  BaseNodeProps,
  Track,
  Keyframe,
  EasingName,
  EasingSpec,
  Anchor,
  Color,
  NarrationTrack,
} from "./spec/types.js";

export {
  SPEC_VERSION,
  NODE_TYPES,
  ANIMATABLE_PROPERTIES,
  ANIMATABLE_BY_TYPE,
  ALLOWED_KEYS,
  EASING_NAMES,
  LIMITS,
  totalFrames,
} from "./spec/schema.js";

// Validation
export { validateScene, assertValidScene } from "./validator/validate.js";
export type { ValidationError, ValidationResult } from "./validator/validate.js";

// Rendering
export { renderFrame } from "./engine/render.js";
export type { RenderResult } from "./engine/render.js";

// Lower-level building blocks (useful for tests, tooling, and future milestones)
export { makeRng, hashSeed } from "./engine/rng.js";
export type { Rng } from "./engine/rng.js";
export { parseColor, rgbaToString, isParseableColor } from "./engine/color.js";
export type { Rgba } from "./engine/color.js";
export { applyEasing, resolveEasing, cubicBezier } from "./engine/easing.js";
export { lerp, lerpColor, sampleNumberTrack, sampleColorTrack, sampleTrack } from "./engine/interpolate.js";
export { ensureFontsRegistered, assetsDir, DEFAULT_FONT_FAMILY } from "./engine/fonts.js";
