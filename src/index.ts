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
export { validateScene, assertValidScene, VALIDATION_CODES } from "./validator/validate.js";
export type { ValidationError, ValidationResult, ValidationCode } from "./validator/validate.js";

// Rendering
export { renderFrame } from "./engine/render.js";
export type { RenderResult } from "./engine/render.js";

// Encoding (M1: spec -> mp4, M2.1: streaming)
export { encodeSceneToFile, encodeSceneToStream } from "./encode/encodeVideo.js";
export type { EncodeOptions, EncodeResult, StreamEncodeOptions } from "./encode/encodeVideo.js";

// Frame pool (M1.1: multi-core frame rendering)
export { FramePool, renderFramesParallel, renderFramesSequential, defaultConcurrency } from "./render/framePool.js";
export type { RenderedFrame, FramePoolOptions } from "./render/framePool.js";

// Lower-level building blocks (useful for tests, tooling, and future milestones)
export { makeRng, hashSeed } from "./engine/rng.js";
export type { Rng } from "./engine/rng.js";
export { parseColor, rgbaToString, isParseableColor } from "./engine/color.js";
export type { Rgba } from "./engine/color.js";
export { applyEasing, resolveEasing, cubicBezier } from "./engine/easing.js";
export { lerp, lerpColor, sampleNumberTrack, sampleColorTrack, sampleTrack } from "./engine/interpolate.js";
export { normalizeColor } from "./engine/color.js";
export { ensureFontsRegistered, assetsDir, DEFAULT_FONT_FAMILY, isRegisteredFamily } from "./engine/fonts.js";
export { REGISTERED_FONT_FAMILIES } from "./spec/schema.js";

// Self-describing schema (M4 contract)
export { describeScene, exampleScene } from "./spec/describe.js";
export type { SchemaDescription } from "./spec/describe.js";

// Service layer (M1.3 HTTP capability surface + storage)
export { RenderService, stableStringify } from "./service/renderService.js";
export type { RenderOptions, RenderResultRef, PreviewResult, RenderServiceOptions } from "./service/renderService.js";
export { LocalObjectStorage, contentKey, guessContentType } from "./service/storage.js";
export type { ObjectStorage, StoredObject } from "./service/storage.js";
export { createServer, listen } from "./service/httpServer.js";
export { startWorker } from "./service/worker.js";

// Async jobs (M2.2)
export { InMemoryJobStore, JobRunner, toJobView } from "./service/jobs.js";
export type { Job, JobView, JobStatus, JobStore, JobResult, JobProgress, JobRunnerOptions } from "./service/jobs.js";
