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

// Encoding (M1: spec -> mp4, M2.1: streaming, M6.3: HLS)
export { encodeSceneToFile, encodeSceneToStream, encodeSceneToHls } from "./encode/encodeVideo.js";
export type { EncodeOptions, EncodeResult, StreamEncodeOptions, HlsEncodeOptions, HlsResult } from "./encode/encodeVideo.js";

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

// Distributed rendering (M3)
export { Coordinator } from "./distributed/coordinator.js";
export type { JobStatusView, CoordinatorOptions } from "./distributed/coordinator.js";
export { ShardWorker } from "./distributed/shardWorker.js";
export type { ShardWorkerOptions, StepOutcome } from "./distributed/shardWorker.js";
export { InMemoryLeaseQueue } from "./distributed/queue.js";
export type { Queue, LeasedMessage, InMemoryQueueOptions } from "./distributed/queue.js";
export { renderDistributed } from "./distributed/cluster.js";
export type { ClusterOptions, DistributedResult } from "./distributed/cluster.js";
export { renderSegment, decodeSegment, assembleSegments } from "./distributed/segment.js";
export { CoordinatorService, createCoordinatorServer, listenCoordinator } from "./distributed/coordinatorService.js";
export type { CoordinatorServiceOptions } from "./distributed/coordinatorService.js";

// Beautiful + learning-grade (M5)
export type { PolygonNode, NarrationSegment } from "./spec/types.js";
export { THEMES, DEFAULT_THEME, getTheme, swatch } from "./theme/themes.js";
export type { Theme, Palette } from "./theme/themes.js";
export * as motion from "./motion/presets.js";
export { captionsFromNarration, toVTT, toSRT } from "./audio/captions.js";
export type { Cue } from "./audio/captions.js";
export { SilentTtsProvider, ToneTtsProvider, synthesizeNarration, estimateSpeechDuration } from "./audio/tts.js";
export type { TtsProvider, SynthesizedSpeech } from "./audio/tts.js";
export { muxAudioVideo } from "./audio/mux.js";
export { pcmToWav, silencePcm, tonePcm, SAMPLE_RATE } from "./audio/wav.js";
export { RuleBasedModeration, moderateScene, collectSceneTexts } from "./safety/moderation.js";
export type { ModerationProvider, ModerationResult, ModerationFinding } from "./safety/moderation.js";
export { buildCountingLesson, buildLessonFromOutline } from "./lessons/templates.js";
export type { CountingLessonOptions, OutlineLessonOptions, LessonSegment } from "./lessons/templates.js";
export type { RenderBlocked, RenderSuccess } from "./service/renderService.js";

// MCP + authoring (M4)
export { DirectBackend, HttpBackend, TOOL_DEFINITIONS, callTool } from "./mcp/showmanTools.js";
export type { ShowmanClient, ToolDefinition, PreviewOk, CapabilityErr } from "./mcp/showmanTools.js";
export { createMcpServer, startMcpServer } from "./mcp/server.js";
export { AuthoringAgent, ScriptedAuthor, AnthropicSpecAuthor, extractJson } from "./authoring/agent.js";
export type { SpecAuthor, AuthorContext, AuthoringResult, AuthoringOptions, AuthoringAttempt } from "./authoring/agent.js";
export type {
  ShardTask,
  ShardResult,
  ProgressEvent,
  JobState,
  DistributedRenderOptions,
} from "./distributed/messages.js";
export { buildEncodeArgs } from "./encode/ffmpegArgs.js";
