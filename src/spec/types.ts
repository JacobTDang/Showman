/**
 * The Scene Spec — the universal contract.
 *
 * A scene is a serializable JSON tree. The renderer is a pure function
 * (spec, frameIndex) -> pixels. Everything in the system (agent -> gateway ->
 * coordinator -> workers) speaks this shape. Keep it serializable: no functions,
 * no class instances, no cycles.
 *
 * Time is expressed in **seconds** (not frame indices) so that animation timing
 * is independent of fps and re-rendering at a different fps preserves motion.
 */

import type { InteractionTrack } from "../interaction/types.js";

/** A color string: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(...)`, `rgba(...)`, or a supported named color. */
export type Color = string;

/** Named easing curves. See {@link EasingSpec} for the custom cubic-bezier form. */
export type EasingName =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeInSine"
  | "easeOutSine"
  | "easeInOutSine"
  | "easeInBack"
  | "easeOutBack"
  | "easeInOutBack"
  | "easeOutElastic"
  | "easeOutBounce";

/** An easing curve: a named curve or a custom cubic-bezier `[x1, y1, x2, y2]`. */
export type EasingSpec = EasingName | [number, number, number, number];

/** A single keyframe on an animation track. */
export interface Keyframe {
  /** Time in seconds (>= 0). Keyframes within a track must be strictly ascending in `t`. */
  t: number;
  /** Target value: a number for numeric properties, a {@link Color} for color properties. */
  value: number | Color;
  /**
   * Easing curve applied for the segment ending at this keyframe
   * (i.e. from the previous keyframe to this one). Defaults to `"linear"`.
   * Ignored on the first keyframe of a track.
   */
  easing?: EasingSpec;
}

/** A keyframed animation track targeting a single animatable property of a node. */
export interface Track {
  /** Name of the animatable property (e.g. `"x"`, `"opacity"`, `"fill"`). */
  property: string;
  /** Keyframes, strictly ascending by `t`. At least one is required. */
  keyframes: Keyframe[];
}

/** Rotation/scale pivot, in the node's local pixel space. Defaults to `{ x: 0, y: 0 }`. */
export interface Anchor {
  x: number;
  y: number;
}

/** Properties shared by every node. All transform props are animatable. */
export interface BaseNodeProps {
  /** X position in parent space (px). Default 0. */
  x?: number;
  /** Y position in parent space (px). Default 0. */
  y?: number;
  /** Rotation in degrees. Default 0. */
  rotation?: number;
  /** Uniform scale. Default 1. Overridden per-axis by `scaleX`/`scaleY` when present. */
  scale?: number;
  /** Horizontal scale. Falls back to `scale`, then 1. */
  scaleX?: number;
  /** Vertical scale. Falls back to `scale`, then 1. */
  scaleY?: number;
  /** Opacity 0..1. Multiplies down through groups. Default 1. */
  opacity?: number;
  /** Rotation/scale pivot in local pixels. Default `{ x: 0, y: 0 }`. */
  anchor?: Anchor;
  /** Blend mode for compositing this node. On a group it applies to each child individually
   * (not as one flattened layer); blend a single shape for a uniform effect. Default `"normal"`. */
  blend?: BlendMode;
  /** Gaussian blur radius in px for this node's own drawing (on a group: each child individually,
   * not the merged subtree). Animatable. Capped at 200px. Default 0. */
  blur?: number;
  /** Keyframed animation tracks for this node. */
  tracks?: Track[];
}

/** How a node composites onto what's already drawn. */
export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "add"
  | "difference"
  | "exclusion"
  | "soft-light"
  | "hard-light"
  | "color-dodge"
  | "color-burn";

export interface RectNode extends BaseNodeProps {
  id: string;
  type: "rect";
  /** Width in px. Default 100. Animatable. */
  width?: number;
  /** Height in px. Default 100. Animatable. */
  height?: number;
  /** Fill color. Default `"#000000"`. Animatable. Use `"transparent"` for no fill. */
  fill?: Color;
  /** Stroke color. Default none. Animatable. */
  stroke?: Color;
  /** Stroke width in px. Default 0. Animatable. */
  strokeWidth?: number;
  /** Corner radius in px. Default 0. Animatable. */
  radius?: number;
}

export interface EllipseNode extends BaseNodeProps {
  id: string;
  type: "ellipse";
  /** Bounding-box width in px. Default 100. Animatable. */
  width?: number;
  /** Bounding-box height in px. Default 100. Animatable. */
  height?: number;
  /** Fill color. Default `"#000000"`. Animatable. */
  fill?: Color;
  /** Stroke color. Default none. Animatable. */
  stroke?: Color;
  /** Stroke width in px. Default 0. Animatable. */
  strokeWidth?: number;
}

export interface PolygonNode extends BaseNodeProps {
  id: string;
  type: "polygon";
  /** Number of sides/points (>= 3). Default 3 (triangle). */
  sides?: number;
  /** Circumradius in px. The node spans 2*radius. Default 50. Animatable. */
  radius?: number;
  /** If set, alternates outer/inner radius to make a star. Animatable. */
  innerRadius?: number;
  /** Fill color. Default `"#000000"`. Animatable. */
  fill?: Color;
  /** Stroke color. Default none. Animatable. */
  stroke?: Color;
  /** Stroke width in px. Default 0. Animatable. */
  strokeWidth?: number;
}

export interface PolylineNode extends BaseNodeProps {
  id: string;
  type: "polyline";
  /** Connected points in local space (relative to x,y). At least 2 required. */
  points: { x: number; y: number }[];
  /** Stroke color. Default `"#000000"`. Animatable. */
  stroke?: Color;
  /** Stroke width in px. Default 2. Animatable. */
  strokeWidth?: number;
  /** Fill color for a closed shape. Default none. Animatable. Filled only at full `progress`. */
  fill?: Color;
  /** Close the path (connect last point back to first). Default false. */
  closed?: boolean;
  /** Line cap style. Default `"round"`. */
  lineCap?: "butt" | "round" | "square";
  /** Line join style. Default `"round"`. */
  lineJoin?: "miter" | "round" | "bevel";
  /** Draw-on progress 0..1: draws only the first portion of the path length. Default 1. Animatable. */
  progress?: number;
  /** Optional target points (same length as `points`) for shape morphing. */
  morphTo?: { x: number; y: number }[];
  /** Morph amount 0..1 — interpolates `points` toward `morphTo`. Default 0. Animatable. */
  morph?: number;
}

export interface PathNode extends BaseNodeProps {
  id: string;
  type: "path";
  /** SVG path data, e.g. "M0 0 L10 10 C … Z". Rendered via Skia (M/L/H/V/C/S/Q/T/A/Z, abs + rel). */
  d: string;
  /** Fill color. Default none. Animatable. */
  fill?: Color;
  /** Stroke color (defaults to black only when there is no fill). Animatable. */
  stroke?: Color;
  /** Stroke width in px. Default 2. Animatable. */
  strokeWidth?: number;
  /** Fill rule for self-intersecting paths. Default `"nonzero"`. */
  fillRule?: "nonzero" | "evenodd";
  /** Line cap style. Default `"round"`. */
  lineCap?: "butt" | "round" | "square";
  /** Line join style. Default `"round"`. */
  lineJoin?: "miter" | "round" | "bevel";
  /** Draw-on 0..1: strokes only the first portion of the path length (fill appears at 1). Default 1. Animatable. */
  progress?: number;
}

export interface ImageNode extends BaseNodeProps {
  id: string;
  type: "image";
  /** Image source: a `data:` URI, a frozen asset hash (resolved by prepareImages), or a file path. */
  src: string;
  /** Drawn width in px (defaults to the image's natural width). Animatable. */
  width?: number;
  /** Drawn height in px (defaults to natural height). Animatable. */
  height?: number;
  /** How the image fills its box. Default `"fill"` (stretch). */
  fit?: "fill" | "contain" | "cover";
  /** Corner radius for clipping in px. Default 0. */
  radius?: number;
}

export interface ArcNode extends BaseNodeProps {
  id: string;
  type: "arc";
  /** Outer radius in px. Bounding box is 2*radius; center at local (radius, radius). Default 50. Animatable. */
  radius?: number;
  /** Inner radius (>0 makes a ring/annular sector; 0 is a pie slice). Clamped below `radius`. Default 0. Animatable. */
  innerRadius?: number;
  /** Start angle in degrees, clockwise from 12 o'clock. Default 0. Animatable. */
  startAngle?: number;
  /** End angle in degrees. Visible sweep is `endAngle - startAngle` (a filling fraction). Default 360. Animatable. */
  endAngle?: number;
  /** Fill color. Default `"#000000"`. Animatable. */
  fill?: Color;
  /** Stroke color. Default none. Animatable. */
  stroke?: Color;
  /** Stroke width in px. Default 0. Animatable. */
  strokeWidth?: number;
}

export interface CounterNode extends BaseNodeProps {
  id: string;
  type: "counter";
  /** The number shown. Animate this for a count-up / odometer effect. Default 0. Animatable. */
  value?: number;
  /** Fixed decimal places. Default 0. */
  decimals?: number;
  /** Text shown before the number (e.g. `"$"`). Default `""`. */
  prefix?: string;
  /** Text shown after the number (e.g. `"%"`, `" points"`). Default `""`. */
  suffix?: string;
  /** Font size in px. Default 48. Animatable. */
  fontSize?: number;
  /** Font family. Default `"Nunito"` (pinned). */
  fontFamily?: string;
  /** Font weight. Default 700. */
  fontWeight?: number | "normal" | "bold";
  /** Horizontal alignment relative to `(x, y)`. Default `"center"`. */
  align?: "left" | "center" | "right";
  /** Vertical baseline relative to `(x, y)`. Default `"middle"`. */
  baseline?: "top" | "middle" | "alphabetic" | "bottom";
  /** Fill color. Default `"#000000"`. Animatable. */
  fill?: Color;
  /** Stroke color. Default none. Animatable. */
  stroke?: Color;
  /** Stroke width in px. Default 0. Animatable. */
  strokeWidth?: number;
}

export interface TextNode extends BaseNodeProps {
  id: string;
  type: "text";
  /** The text to render. Required. */
  text: string;
  /**
   * Typewriter reveal 0..1: only the first `round(reveal * length)` characters
   * draw. Animate it for a reading reveal. Default 1 (all shown). Animatable.
   */
  reveal?: number;
  /** Font size in px. Default 48. Animatable. */
  fontSize?: number;
  /** Font family. Default `"Nunito"` (pinned). */
  fontFamily?: string;
  /** Font weight 100..900 or `"normal"`/`"bold"`. Default 400. */
  fontWeight?: number | "normal" | "bold";
  /** Horizontal alignment of `text` relative to `(x, y)`. Default `"left"`. */
  align?: "left" | "center" | "right";
  /** Vertical baseline relative to `(x, y)`. Default `"top"`. */
  baseline?: "top" | "middle" | "alphabetic" | "bottom";
  /** Fill color. Default `"#000000"`. Animatable. */
  fill?: Color;
  /** Stroke (outline) color. Default none. Animatable. */
  stroke?: Color;
  /** Stroke width in px. Default 0. Animatable. */
  strokeWidth?: number;
  /**
   * Max line width in px. When set, text word-wraps to fit (and still honors explicit `\n`);
   * inter-word whitespace is collapsed to a single space (standard word-wrap). Omit for
   * single-line text (the default; byte-identical to before).
   */
  maxWidth?: number;
  /** Line height as a multiple of `fontSize` for multi-line/wrapped text. Default 1.25. */
  lineHeight?: number;
  /** Extra spacing between characters in px (tracking). Can be negative. Default 0. */
  letterSpacing?: number;
}

export interface GroupNode extends BaseNodeProps {
  id: string;
  type: "group";
  /** Child nodes, drawn in this group's transformed space. */
  children: Node[];
  /** Clip children to a rounded-rect window from the group origin (spotlight / mask). */
  clip?: { width: number; height: number; radius?: number };
}

/** A node in the scene tree. */
export type Node =
  RectNode | EllipseNode | PolygonNode | PolylineNode | PathNode | ImageNode | ArcNode | CounterNode | TextNode | GroupNode;

export type NodeType = Node["type"];

/**
 * Narration track — reserved for M5 (narration & audio). The M0 renderer ignores
 * it, but it is part of the contract from day one so the schema does not break
 * when audio lands. Validated leniently.
 */
export interface NarrationSegment {
  /** Start time in seconds. */
  t: number;
  /** The line to speak / caption. */
  text: string;
  /** Optional explicit spoken duration (seconds). If omitted, runs until the next segment. */
  duration?: number;
}

export interface NarrationTrack {
  /** Narration beats, each timed to a point in the scene (seconds). */
  segments?: NarrationSegment[];
  /** Voice identifier for the TTS step. */
  voice?: string;
}

/** A complete scene — the top-level spec. */
export interface SceneSpec {
  /** Schema version. Must equal the engine's {@link SPEC_VERSION}. */
  specVersion: number;
  /** Output width in px (positive integer). */
  width: number;
  /** Output height in px (positive integer). */
  height: number;
  /** Frames per second (positive). */
  fps: number;
  /** Scene duration in seconds (positive). */
  duration: number;
  /** Deterministic RNG seed (integer). Default 0. */
  seed?: number;
  /** Background fill color. Default `"#ffffff"`. */
  background?: Color;
  /** The scene's nodes, drawn in order (later nodes paint on top). */
  nodes: Node[];
  /** Reserved for M5. Ignored by the M0 renderer. */
  narration?: NarrationTrack;
  /** Interaction sidecar (quizzes / pauses / hotspots). Ignored by the renderer; emitted
   * as `interactions.json` and overlaid by the player. See {@link InteractionTrack}. */
  interactions?: InteractionTrack;
}
