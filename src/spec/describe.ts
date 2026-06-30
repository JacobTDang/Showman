/**
 * Self-describing schema. Returns a structured description of the Scene Spec an
 * agent can read to author valid scenes without any hardcoded knowledge of the
 * format. This is the contract M4's "get schema" tool exposes.
 */

import {
  ALLOWED_KEYS,
  ANIMATABLE_BY_TYPE,
  ANIMATABLE_PROPERTIES,
  EASING_NAMES,
  LIMITS,
  NODE_TYPES,
  REGISTERED_FONT_FAMILIES,
  SCENE_DEFAULTS,
  SHAPE_DEFAULTS,
  SPEC_VERSION,
} from "./schema.js";
import type { SceneSpec } from "./types.js";

/** Required properties per node type (beyond the universal `id`/`type`). */
const REQUIRED_BY_TYPE: Record<string, string[]> = {
  rect: [],
  ellipse: [],
  text: ["text"],
  group: ["children"],
  polyline: ["points"],
  path: ["d"],
  image: ["src"],
};

export interface SchemaDescription {
  specVersion: number;
  description: string;
  scene: {
    required: string[];
    optional: string[];
    defaults: Record<string, unknown>;
    limits: typeof LIMITS;
  };
  nodeTypes: Record<string, { required: string[]; allowedKeys: readonly string[]; animatableProperties: readonly string[] }>;
  animatablePropertyKinds: Record<string, string>;
  /** Shapes of object-valued props (which `allowedKeys` only lists by name). */
  compositeProps: Record<string, string>;
  easings: readonly string[];
  fonts: readonly string[];
  timeModel: string;
  example: SceneSpec;
}

/** A small, valid example scene returned with the schema for grounding. */
export function exampleScene(): SceneSpec {
  return {
    specVersion: SPEC_VERSION,
    width: 640,
    height: 360,
    fps: 30,
    duration: 2,
    seed: 1,
    background: "#fdf6e3",
    nodes: [
      {
        id: "title",
        type: "text",
        x: 320,
        y: 60,
        text: "Hello!",
        fontSize: 48,
        fontWeight: 800,
        fill: "#1d6f72",
        align: "center",
        baseline: "middle",
      },
      {
        id: "ball",
        type: "ellipse",
        x: 290,
        y: 160,
        width: 60,
        height: 60,
        fill: "#e63946",
        anchor: { x: 30, y: 30 },
        tracks: [
          {
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.6, value: 1, easing: "easeOutQuad" },
            ],
          },
          {
            property: "scale",
            keyframes: [
              { t: 0, value: 0.5 },
              { t: 0.6, value: 1, easing: "easeOutBack" },
            ],
          },
        ],
      },
    ],
  };
}

/** Intersection (preserving the first array's order) of several key lists. */
function intersectKeys(lists: readonly (readonly string[])[]): string[] {
  if (lists.length === 0) return [];
  return [...lists[0]!].filter((k) => lists.every((l) => l.includes(k)));
}

let compactCache: string | undefined;

/**
 * A *compact* schema digest — the same contract as {@link describeScene} but as a
 * terse, token-frugal text block instead of an 8–15 KB JSON dump. It states the node
 * types, their extra keys (beyond the universal ones), what each type can animate,
 * the limits, fonts, and easings — and nothing else. On a ~120B open model this is
 * the difference between burning thousands of tokens of schema on *every* attempt and
 * sending a focused, signal-dense spec the model can actually follow.
 *
 * Built entirely from the same registries the validator reads, so it can never drift
 * from "what validates". Cached (the registries are constant per SPEC_VERSION).
 */
export function describeSceneCompact(): string {
  if (compactCache !== undefined) return compactCache;

  const commonKeys = intersectKeys(NODE_TYPES.map((t) => ALLOWED_KEYS[t]));
  const commonAnim = intersectKeys(NODE_TYPES.map((t) => ANIMATABLE_BY_TYPE[t]));
  const baseKeys = commonKeys.filter((k) => k !== "id" && k !== "type");

  const lines: string[] = [];
  lines.push(`Showman Scene Spec v${SPEC_VERSION} — compact schema. Output EXACTLY ONE JSON object, no prose, no markdown fences.`);
  lines.push(
    `Scene: {specVersion:${SPEC_VERSION}, width, height, fps, duration, seed?, background?, nodes:[…]}. Times are seconds; frame N renders at time N/fps.`,
  );
  lines.push(
    `Limits: width 1..${LIMITS.maxWidth}, height 1..${LIMITS.maxHeight}, fps ${LIMITS.minFps}..${LIMITS.maxFps}, ` +
      `duration ≤${LIMITS.maxDuration}s, fps*duration ≤${LIMITS.maxFrames} frames, ≤${LIMITS.maxNodes} nodes, tree depth ≤${LIMITS.maxTreeDepth}.`,
  );
  lines.push(`Every node has: id (unique string), type, and any of: ${baseKeys.join(", ")}.`);
  lines.push(
    `Shared shapes: anchor={x,y}; gradient overrides fill — ` +
      `linear:{type:"linear",from:{x,y},to:{x,y},stops:[{offset:0..1,color}]} or radial:{type:"radial",center:{x,y},radius,stops:[…]}; ` +
      `shadow:{color?,blur?≥0,offsetX?,offsetY?}; dash=number[] (≥1px each, sum≥1); background=color string OR {fill?,vignette?0..1,grain?0..1}.`,
  );
  lines.push("Node types — extra keys beyond the shared set (* = required):");
  for (const t of NODE_TYPES) {
    const req = REQUIRED_BY_TYPE[t] ?? [];
    const extra = ALLOWED_KEYS[t].filter((k) => !commonKeys.includes(k)).map((k) => (req.includes(k) ? `${k}*` : k));
    lines.push(`  ${t}: ${extra.length ? extra.join(", ") : "(no extra keys)"}`);
  }
  lines.push(
    `Animation: tracks:[{property, keyframes:[{t, value, easing?}]}], keyframe t strictly ascending from 0. ` +
      `value is a number except fill/stroke which are color strings.`,
  );
  lines.push(`All node types animate: ${commonAnim.join(", ")}.`);
  lines.push("Extra animatable properties per type:");
  for (const t of NODE_TYPES) {
    const extra = ANIMATABLE_BY_TYPE[t].filter((k) => !commonAnim.includes(k));
    if (extra.length) lines.push(`  ${t}: ${extra.join(", ")}`);
  }
  lines.push(`Fonts (use ONLY these): ${REGISTERED_FONT_FAMILIES.join(", ")}.`);
  lines.push(`Easings: ${EASING_NAMES.join(", ")}.`);

  compactCache = lines.join("\n");
  return compactCache;
}

/** Describe the Scene Spec contract. */
export function describeScene(): SchemaDescription {
  const nodeTypes: SchemaDescription["nodeTypes"] = {};
  for (const t of NODE_TYPES) {
    nodeTypes[t] = {
      required: REQUIRED_BY_TYPE[t] ?? [],
      allowedKeys: ALLOWED_KEYS[t],
      animatableProperties: ANIMATABLE_BY_TYPE[t],
    };
  }
  return {
    specVersion: SPEC_VERSION,
    description:
      "Showman Scene Spec: a serializable scene rendered deterministically to video. " +
      "A scene has dimensions, fps, duration, an optional seed, a background (a color or a Backdrop), and a tree of nodes. " +
      "Each node has base transform props, optional paint (gradient/shadow/dash), and keyframed animation tracks. Times are in seconds.",
    scene: {
      required: ["specVersion", "width", "height", "fps", "duration", "nodes"],
      optional: ["seed", "background", "narration"],
      defaults: { ...SCENE_DEFAULTS, ...SHAPE_DEFAULTS },
      limits: LIMITS,
    },
    nodeTypes,
    animatablePropertyKinds: ANIMATABLE_PROPERTIES,
    compositeProps: {
      background: "A color string OR a Backdrop: { fill?: color | gradient, vignette?: 0..1, grain?: 0..1 }.",
      gradient:
        'Overrides fill. linear: { type:"linear", from:{x,y}, to:{x,y}, stops:[{offset:0..1,color}] }; radial: { type:"radial", center:{x,y}, radius, innerCenter?, innerRadius?, stops }. Coords are local to the node.',
      shadow: "Drop shadow / glow: { color?, blur?≥0, offsetX?, offsetY? } in px (zero offset + blur = glow).",
      dash: "Stroke dash pattern: number[] of px (≥1 positive, sum ≥ 1). Animate `dashOffset` for marching ants.",
    },
    easings: EASING_NAMES,
    fonts: REGISTERED_FONT_FAMILIES,
    timeModel: "Keyframe times and duration are in seconds; frame N renders at time N/fps.",
    example: exampleScene(),
  };
}
