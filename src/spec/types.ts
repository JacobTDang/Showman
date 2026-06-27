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
  /** Keyframed animation tracks for this node. */
  tracks?: Track[];
}

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
}

export interface GroupNode extends BaseNodeProps {
  id: string;
  type: "group";
  /** Child nodes, drawn in this group's transformed space. */
  children: Node[];
}

/** A node in the scene tree. */
export type Node = RectNode | EllipseNode | PolygonNode | TextNode | GroupNode;

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
}
