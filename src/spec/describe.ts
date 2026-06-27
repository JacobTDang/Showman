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
  nodeTypes: Record<
    string,
    { required: string[]; allowedKeys: readonly string[]; animatableProperties: readonly string[] }
  >;
  animatablePropertyKinds: Record<string, string>;
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
          { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 0.6, value: 1, easing: "easeOutQuad" }] },
          { property: "scale", keyframes: [{ t: 0, value: 0.5 }, { t: 0.6, value: 1, easing: "easeOutBack" }] },
        ],
      },
    ],
  };
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
      "A scene has dimensions, fps, duration, an optional seed and background, and a tree of nodes. " +
      "Each node has base transform props and keyframed animation tracks. Times are in seconds.",
    scene: {
      required: ["specVersion", "width", "height", "fps", "duration", "nodes"],
      optional: ["seed", "background", "narration"],
      defaults: { ...SCENE_DEFAULTS, ...SHAPE_DEFAULTS },
      limits: LIMITS,
    },
    nodeTypes,
    animatablePropertyKinds: ANIMATABLE_PROPERTIES,
    easings: EASING_NAMES,
    fonts: REGISTERED_FONT_FAMILIES,
    timeModel: "Keyframe times and duration are in seconds; frame N renders at time N/fps.",
    example: exampleScene(),
  };
}
