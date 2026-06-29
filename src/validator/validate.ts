/**
 * The structured validator.
 *
 * Any spec, valid or not, goes through here and comes back with a list of
 * structured errors — never a thrown stack trace. Each error pinpoints *which*
 * node, *which* property, and *why*, with a machine `code` and a human `message`.
 * This is the surface an authoring agent self-corrects against, so the messages
 * are written to be acted upon (including "did you mean …" suggestions for typos).
 */

import type { NodeType, SceneSpec } from "../spec/types.js";
import {
  ALLOWED_KEYS,
  ANIMATABLE_BY_TYPE,
  ANIMATABLE_PROPERTIES,
  EASING_NAMES,
  LIMITS,
  NODE_TYPES,
  REGISTERED_FONT_FAMILIES,
  SPEC_VERSION,
} from "../spec/schema.js";
import { isParseableColor } from "../engine/color.js";

/**
 * The closed set of machine-readable validation codes. Exported so agent-side
 * self-correction (M4) can switch on a stable contract instead of matching free
 * text. Adding a code here is the only way to introduce a new one.
 */
export const VALIDATION_CODES = [
  "INVALID_TYPE",
  "OUT_OF_RANGE",
  "UNSUPPORTED_VERSION",
  "INVALID_COLOR",
  "UNKNOWN_PROPERTY",
  "MISSING_FIELD",
  "DUPLICATE_ID",
  "UNKNOWN_TYPE",
  "INVALID_VALUE",
  "INVALID_PROPERTY",
  "EMPTY",
  "NOT_ASCENDING",
  "INVALID_EASING",
  "LIMIT_EXCEEDED",
] as const;

export type ValidationCode = (typeof VALIDATION_CODES)[number];

const ALLOWED_TRACK_KEYS = ["property", "keyframes"];
const ALLOWED_KEYFRAME_KEYS = ["t", "value", "easing"];

export interface ValidationError {
  /** JSON-path-like location, e.g. `nodes[2].tracks[0].keyframes[1].t`. */
  path: string;
  /** Id of the node the error concerns, when applicable. */
  nodeId?: string;
  /** The offending property name, when applicable. */
  property?: string;
  /** Machine-readable code from the closed {@link VALIDATION_CODES} set. */
  code: ValidationCode;
  /** Human-readable, actionable explanation. */
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const TOP_LEVEL_KEYS = ["specVersion", "width", "height", "fps", "duration", "seed", "background", "nodes", "narration"];

const TEXT_ALIGN = ["left", "center", "right"];
const TEXT_BASELINE = ["top", "middle", "alphabetic", "bottom"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Levenshtein distance, used only for "did you mean …" suggestions. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n]!;
}

function suggest(key: string, allowed: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const cand of allowed) {
    const d = editDistance(key, cand);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best !== undefined && bestDist <= 2 ? best : undefined;
}

class Validator {
  readonly errors: ValidationError[] = [];
  private readonly seenIds = new Set<string>();
  private nodeCount = 0;

  err(e: ValidationError): void {
    this.errors.push(e);
  }

  validate(spec: unknown): void {
    if (!isObject(spec)) {
      this.err({
        path: "$",
        code: "INVALID_TYPE",
        message: "Scene spec must be a JSON object.",
      });
      return;
    }

    // specVersion
    if (spec.specVersion !== SPEC_VERSION) {
      this.err({
        path: "specVersion",
        property: "specVersion",
        code: "UNSUPPORTED_VERSION",
        message: `specVersion must be ${SPEC_VERSION}; got ${JSON.stringify(spec.specVersion)}.`,
      });
    }

    this.checkIntInRange(spec.width, "width", 1, LIMITS.maxWidth);
    this.checkIntInRange(spec.height, "height", 1, LIMITS.maxHeight);
    this.checkNumberInRange(spec.fps, "fps", LIMITS.minFps, LIMITS.maxFps);
    this.checkNumberInRange(spec.duration, "duration", Number.MIN_VALUE, LIMITS.maxDuration);

    // Hard cap on total frames — farm protection enforced at every backend.
    if (isFiniteNumber(spec.fps) && isFiniteNumber(spec.duration)) {
      const frames = Math.round(spec.fps * spec.duration);
      if (frames > LIMITS.maxFrames) {
        this.err({
          path: "duration",
          property: "duration",
          code: "LIMIT_EXCEEDED",
          message: `Total frames (fps*duration=${frames}) exceeds the maximum ${LIMITS.maxFrames}.`,
        });
      }
    }

    if (spec.seed !== undefined && !Number.isInteger(spec.seed)) {
      this.err({
        path: "seed",
        property: "seed",
        code: "INVALID_TYPE",
        message: `seed must be an integer; got ${JSON.stringify(spec.seed)}.`,
      });
    }

    if (spec.background !== undefined) {
      if (typeof spec.background !== "string" || !isParseableColor(spec.background)) {
        this.err({
          path: "background",
          property: "background",
          code: "INVALID_COLOR",
          message: `background must be a color (hex, rgb()/rgba(), or a named color); got ${JSON.stringify(spec.background)}.`,
        });
      }
    }

    // Unknown top-level keys
    for (const key of Object.keys(spec)) {
      if (!TOP_LEVEL_KEYS.includes(key)) {
        const hint = suggest(key, TOP_LEVEL_KEYS);
        this.err({
          path: key,
          property: key,
          code: "UNKNOWN_PROPERTY",
          message: `Unknown top-level field "${key}".${hint ? ` Did you mean "${hint}"?` : ""}`,
        });
      }
    }

    // narration (reserved for M5) — validated leniently.
    if (spec.narration !== undefined && !isObject(spec.narration)) {
      this.err({
        path: "narration",
        property: "narration",
        code: "INVALID_TYPE",
        message: "narration, if present, must be an object.",
      });
    }

    // nodes
    if (!Array.isArray(spec.nodes)) {
      this.err({
        path: "nodes",
        property: "nodes",
        code: "INVALID_TYPE",
        message: "nodes must be an array.",
      });
      return;
    }
    spec.nodes.forEach((node, i) => this.validateNode(node, `nodes[${i}]`, 0));
  }

  private checkIntInRange(v: unknown, name: string, min: number, max: number): void {
    if (!Number.isInteger(v)) {
      this.err({
        path: name,
        property: name,
        code: "INVALID_TYPE",
        message: `${name} must be an integer; got ${JSON.stringify(v)}.`,
      });
      return;
    }
    const n = v as number;
    if (n < min || n > max) {
      this.err({
        path: name,
        property: name,
        code: "OUT_OF_RANGE",
        message: `${name} must be between ${min} and ${max}; got ${n}.`,
      });
    }
  }

  private checkNumberInRange(v: unknown, name: string, min: number, max: number): void {
    if (!isFiniteNumber(v)) {
      this.err({
        path: name,
        property: name,
        code: "INVALID_TYPE",
        message: `${name} must be a finite number; got ${JSON.stringify(v)}.`,
      });
      return;
    }
    if (v < min || v > max) {
      this.err({
        path: name,
        property: name,
        code: "OUT_OF_RANGE",
        message: `${name} must be between ${min} and ${max}; got ${v}.`,
      });
    }
  }

  private validateNode(node: unknown, path: string, depth: number): void {
    if (depth > LIMITS.maxTreeDepth) {
      this.err({
        path,
        code: "LIMIT_EXCEEDED",
        message: `Scene tree exceeds maximum depth ${LIMITS.maxTreeDepth}.`,
      });
      return;
    }
    if (++this.nodeCount > LIMITS.maxNodes) {
      this.err({
        path,
        code: "LIMIT_EXCEEDED",
        message: `Scene exceeds maximum node count ${LIMITS.maxNodes}.`,
      });
      return;
    }
    if (!isObject(node)) {
      this.err({ path, code: "INVALID_TYPE", message: `Node at ${path} must be an object.` });
      return;
    }

    const nodeId = typeof node.id === "string" ? node.id : undefined;

    // id
    if (typeof node.id !== "string" || node.id.length === 0) {
      this.err({
        path: `${path}.id`,
        ...(nodeId ? { nodeId } : {}),
        property: "id",
        code: "MISSING_FIELD",
        message: `Node at ${path} must have a non-empty string "id".`,
      });
    } else if (this.seenIds.has(node.id)) {
      this.err({
        path: `${path}.id`,
        nodeId: node.id,
        property: "id",
        code: "DUPLICATE_ID",
        message: `Duplicate node id "${node.id}". Ids must be unique across the scene.`,
      });
    } else {
      this.seenIds.add(node.id);
    }

    // type
    const type = node.type;
    if (typeof type !== "string" || !NODE_TYPES.includes(type as NodeType)) {
      this.err({
        path: `${path}.type`,
        ...(nodeId ? { nodeId } : {}),
        property: "type",
        code: "UNKNOWN_TYPE",
        message: `Node "${nodeId ?? "?"}" has unknown type ${JSON.stringify(type)}. Expected one of: ${NODE_TYPES.join(", ")}.`,
      });
      return; // can't validate further without a known type
    }
    const nodeType = type as NodeType;
    const allowed = ALLOWED_KEYS[nodeType];

    // Unknown keys (catches typos like "colour", "with")
    for (const key of Object.keys(node)) {
      if (!allowed.includes(key)) {
        const hint = suggest(key, allowed);
        this.err({
          path: `${path}.${key}`,
          ...(nodeId ? { nodeId } : {}),
          property: key,
          code: "UNKNOWN_PROPERTY",
          message: `Node "${nodeId ?? "?"}" (${nodeType}) has unknown property "${key}".${hint ? ` Did you mean "${hint}"?` : ""}`,
        });
      }
    }

    this.validateBaseProps(node, path, nodeId);
    this.validateTypeProps(node, nodeType, path, nodeId);
    this.validateTracks(node, nodeType, path, nodeId);

    if (nodeType === "group") {
      const children = node.children;
      if (!Array.isArray(children)) {
        this.err({
          path: `${path}.children`,
          ...(nodeId ? { nodeId } : {}),
          property: "children",
          code: "MISSING_FIELD",
          message: `Group "${nodeId ?? "?"}" must have a "children" array.`,
        });
      } else {
        children.forEach((child, i) => this.validateNode(child, `${path}.children[${i}]`, depth + 1));
      }
    }
  }

  private validateBaseProps(node: Record<string, unknown>, path: string, nodeId: string | undefined): void {
    for (const key of ["x", "y", "rotation", "scale", "scaleX", "scaleY"]) {
      if (node[key] !== undefined && !isFiniteNumber(node[key])) {
        this.numTypeError(path, key, node[key], nodeId);
      }
    }
    if (node.opacity !== undefined) {
      if (!isFiniteNumber(node.opacity)) {
        this.numTypeError(path, "opacity", node.opacity, nodeId);
      } else if (node.opacity < 0 || node.opacity > 1) {
        this.err({
          path: `${path}.opacity`,
          ...(nodeId ? { nodeId } : {}),
          property: "opacity",
          code: "OUT_OF_RANGE",
          message: `opacity must be between 0 and 1; got ${node.opacity}.`,
        });
      }
    }
    if (node.anchor !== undefined) {
      const a = node.anchor;
      if (!isObject(a) || !isFiniteNumber(a.x) || !isFiniteNumber(a.y)) {
        this.err({
          path: `${path}.anchor`,
          ...(nodeId ? { nodeId } : {}),
          property: "anchor",
          code: "INVALID_TYPE",
          message: `anchor must be an object { x: number, y: number }.`,
        });
      }
    }
  }

  private validateTypeProps(node: Record<string, unknown>, type: NodeType, path: string, nodeId: string | undefined): void {
    const nonNegNum = (key: string) => {
      const v = node[key];
      if (v === undefined) return;
      if (!isFiniteNumber(v)) this.numTypeError(path, key, v, nodeId);
      else if (v < 0)
        this.err({
          path: `${path}.${key}`,
          ...(nodeId ? { nodeId } : {}),
          property: key,
          code: "OUT_OF_RANGE",
          message: `${key} must be >= 0; got ${v}.`,
        });
    };
    const colorProp = (key: string) => {
      const v = node[key];
      if (v === undefined) return;
      if (typeof v !== "string" || !isParseableColor(v)) {
        this.err({
          path: `${path}.${key}`,
          ...(nodeId ? { nodeId } : {}),
          property: key,
          code: "INVALID_COLOR",
          message: `${key} must be a color (hex, rgb()/rgba(), or a named color); got ${JSON.stringify(v)}.`,
        });
      }
    };

    if (type === "rect") {
      nonNegNum("width");
      nonNegNum("height");
      nonNegNum("strokeWidth");
      nonNegNum("radius");
      colorProp("fill");
      colorProp("stroke");
    } else if (type === "ellipse") {
      nonNegNum("width");
      nonNegNum("height");
      nonNegNum("strokeWidth");
      colorProp("fill");
      colorProp("stroke");
    } else if (type === "polygon") {
      if (node.sides !== undefined) {
        if (!Number.isInteger(node.sides) || (node.sides as number) < 3) {
          this.err({
            path: `${path}.sides`,
            ...(nodeId ? { nodeId } : {}),
            property: "sides",
            code: "OUT_OF_RANGE",
            message: `sides must be an integer >= 3; got ${JSON.stringify(node.sides)}.`,
          });
        }
      }
      nonNegNum("radius");
      nonNegNum("innerRadius");
      nonNegNum("strokeWidth");
      colorProp("fill");
      colorProp("stroke");
    } else if (type === "polyline") {
      const pts = node.points;
      if (!Array.isArray(pts) || pts.length < 2) {
        this.err({
          path: `${path}.points`,
          ...(nodeId ? { nodeId } : {}),
          property: "points",
          code: "MISSING_FIELD",
          message: `polyline "${nodeId ?? "?"}" must have a "points" array of at least 2 { x, y } points.`,
        });
      } else {
        pts.forEach((p, i) => {
          if (!isObject(p) || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
            this.err({
              path: `${path}.points[${i}]`,
              ...(nodeId ? { nodeId } : {}),
              property: "points",
              code: "INVALID_TYPE",
              message: `Each polyline point must be { x: number, y: number }; got ${JSON.stringify(p)}.`,
            });
          }
        });
      }
      nonNegNum("strokeWidth");
      colorProp("stroke");
      colorProp("fill");
      if (node.progress !== undefined && (!isFiniteNumber(node.progress) || node.progress < 0 || node.progress > 1)) {
        this.err({
          path: `${path}.progress`,
          ...(nodeId ? { nodeId } : {}),
          property: "progress",
          code: "OUT_OF_RANGE",
          message: `progress must be a number between 0 and 1; got ${JSON.stringify(node.progress)}.`,
        });
      }
      if (node.closed !== undefined && typeof node.closed !== "boolean") {
        this.err({
          path: `${path}.closed`,
          ...(nodeId ? { nodeId } : {}),
          property: "closed",
          code: "INVALID_TYPE",
          message: `closed must be a boolean.`,
        });
      }
      this.enumProp(node, "lineCap", ["butt", "round", "square"], path, nodeId);
      this.enumProp(node, "lineJoin", ["miter", "round", "bevel"], path, nodeId);
      if (node.morphTo !== undefined) {
        const mt = node.morphTo;
        if (!Array.isArray(mt)) {
          this.err({
            path: `${path}.morphTo`,
            ...(nodeId ? { nodeId } : {}),
            property: "morphTo",
            code: "INVALID_TYPE",
            message: `morphTo must be an array of { x, y } points.`,
          });
        } else {
          if (Array.isArray(node.points) && mt.length !== node.points.length) {
            this.err({
              path: `${path}.morphTo`,
              ...(nodeId ? { nodeId } : {}),
              property: "morphTo",
              code: "OUT_OF_RANGE",
              message: `morphTo must have the same length as points (${node.points.length}); got ${mt.length}.`,
            });
          }
          mt.forEach((p, i) => {
            if (!isObject(p) || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
              this.err({
                path: `${path}.morphTo[${i}]`,
                ...(nodeId ? { nodeId } : {}),
                property: "morphTo",
                code: "INVALID_TYPE",
                message: `Each morphTo point must be { x: number, y: number }.`,
              });
            }
          });
        }
      }
      if (node.morph !== undefined && (!isFiniteNumber(node.morph) || node.morph < 0 || node.morph > 1)) {
        this.err({
          path: `${path}.morph`,
          ...(nodeId ? { nodeId } : {}),
          property: "morph",
          code: "OUT_OF_RANGE",
          message: `morph must be a number between 0 and 1; got ${JSON.stringify(node.morph)}.`,
        });
      }
    } else if (type === "path") {
      if (typeof node.d !== "string" || node.d.trim() === "") {
        this.err({
          path: `${path}.d`,
          ...(nodeId ? { nodeId } : {}),
          property: "d",
          code: "MISSING_FIELD",
          message: `path "${nodeId ?? "?"}" must have a non-empty "d" SVG path string.`,
        });
      }
      nonNegNum("strokeWidth");
      colorProp("fill");
      colorProp("stroke");
      if (node.progress !== undefined && (!isFiniteNumber(node.progress) || node.progress < 0 || node.progress > 1)) {
        this.err({
          path: `${path}.progress`,
          ...(nodeId ? { nodeId } : {}),
          property: "progress",
          code: "OUT_OF_RANGE",
          message: `progress must be a number between 0 and 1; got ${JSON.stringify(node.progress)}.`,
        });
      }
      this.enumProp(node, "fillRule", ["nonzero", "evenodd"], path, nodeId);
      this.enumProp(node, "lineCap", ["butt", "round", "square"], path, nodeId);
      this.enumProp(node, "lineJoin", ["miter", "round", "bevel"], path, nodeId);
    } else if (type === "arc") {
      nonNegNum("radius");
      nonNegNum("innerRadius");
      nonNegNum("strokeWidth");
      for (const k of ["startAngle", "endAngle"]) {
        if (node[k] !== undefined && !isFiniteNumber(node[k])) this.numTypeError(path, k, node[k], nodeId);
      }
      colorProp("fill");
      colorProp("stroke");
    } else if (type === "counter") {
      if (node.value !== undefined && !isFiniteNumber(node.value)) this.numTypeError(path, "value", node.value, nodeId);
      if (node.decimals !== undefined && (!Number.isInteger(node.decimals) || (node.decimals as number) < 0)) {
        this.err({
          path: `${path}.decimals`,
          ...(nodeId ? { nodeId } : {}),
          property: "decimals",
          code: "OUT_OF_RANGE",
          message: `decimals must be an integer >= 0; got ${JSON.stringify(node.decimals)}.`,
        });
      }
      for (const k of ["prefix", "suffix"]) {
        if (node[k] !== undefined && typeof node[k] !== "string") {
          this.err({
            path: `${path}.${k}`,
            ...(nodeId ? { nodeId } : {}),
            property: k,
            code: "INVALID_TYPE",
            message: `${k} must be a string.`,
          });
        }
      }
      nonNegNum("fontSize");
      nonNegNum("strokeWidth");
      colorProp("fill");
      colorProp("stroke");
      this.validateFontProps(node, path, nodeId);
    } else if (type === "text") {
      if (typeof node.text !== "string" || node.text.length === 0) {
        this.err({
          path: `${path}.text`,
          ...(nodeId ? { nodeId } : {}),
          property: "text",
          code: "MISSING_FIELD",
          message: `Text node "${nodeId ?? "?"}" must have a non-empty "text" string.`,
        });
      }
      nonNegNum("fontSize");
      nonNegNum("strokeWidth");
      colorProp("fill");
      colorProp("stroke");
      if (node.reveal !== undefined) {
        if (!isFiniteNumber(node.reveal) || node.reveal < 0 || node.reveal > 1) {
          this.err({
            path: `${path}.reveal`,
            ...(nodeId ? { nodeId } : {}),
            property: "reveal",
            code: "OUT_OF_RANGE",
            message: `reveal must be a number between 0 and 1; got ${JSON.stringify(node.reveal)}.`,
          });
        }
      }
      this.validateFontProps(node, path, nodeId);
    }
  }

  /** Shared font validation for text + counter nodes: pinned family, weight, align, baseline. */
  private validateFontProps(node: Record<string, unknown>, path: string, nodeId: string | undefined): void {
    if (node.fontFamily !== undefined) {
      const fam = node.fontFamily;
      if (typeof fam !== "string" || !(REGISTERED_FONT_FAMILIES as readonly string[]).includes(fam)) {
        this.err({
          path: `${path}.fontFamily`,
          ...(nodeId ? { nodeId } : {}),
          property: "fontFamily",
          code: "INVALID_VALUE",
          message: `fontFamily must be one of the engine's pinned families (${REGISTERED_FONT_FAMILIES.join(
            ", ",
          )}); got ${JSON.stringify(fam)}. A non-pinned font would fall back to host system fonts and break cross-machine determinism.`,
        });
      }
    }
    if (node.fontWeight !== undefined) {
      const w = node.fontWeight;
      const ok = w === "normal" || w === "bold" || (isFiniteNumber(w) && w >= 1 && w <= 1000);
      if (!ok) {
        this.err({
          path: `${path}.fontWeight`,
          ...(nodeId ? { nodeId } : {}),
          property: "fontWeight",
          code: "INVALID_VALUE",
          message: `fontWeight must be a number 1..1000 or "normal"/"bold"; got ${JSON.stringify(w)}.`,
        });
      }
    }
    this.enumProp(node, "align", TEXT_ALIGN, path, nodeId);
    this.enumProp(node, "baseline", TEXT_BASELINE, path, nodeId);
  }

  private validateTracks(node: Record<string, unknown>, type: NodeType, path: string, nodeId: string | undefined): void {
    const tracks = node.tracks;
    if (tracks === undefined) return;
    if (!Array.isArray(tracks)) {
      this.err({
        path: `${path}.tracks`,
        ...(nodeId ? { nodeId } : {}),
        property: "tracks",
        code: "INVALID_TYPE",
        message: `tracks must be an array.`,
      });
      return;
    }
    const animatable = ANIMATABLE_BY_TYPE[type];
    tracks.forEach((track, ti) => {
      const tp = `${path}.tracks[${ti}]`;
      if (!isObject(track)) {
        this.err({ path: tp, ...(nodeId ? { nodeId } : {}), code: "INVALID_TYPE", message: `Track must be an object.` });
        return;
      }
      for (const key of Object.keys(track)) {
        if (!ALLOWED_TRACK_KEYS.includes(key)) {
          const hint = suggest(key, ALLOWED_TRACK_KEYS);
          this.err({
            path: `${tp}.${key}`,
            ...(nodeId ? { nodeId } : {}),
            property: key,
            code: "UNKNOWN_PROPERTY",
            message: `Unknown track field "${key}".${hint ? ` Did you mean "${hint}"?` : ""}`,
          });
        }
      }
      const property = track.property;
      if (typeof property !== "string") {
        this.err({
          path: `${tp}.property`,
          ...(nodeId ? { nodeId } : {}),
          property: "property",
          code: "MISSING_FIELD",
          message: `Track must name a "property" string.`,
        });
        return;
      }
      if (!animatable.includes(property)) {
        const hint = suggest(property, animatable);
        this.err({
          path: `${tp}.property`,
          ...(nodeId ? { nodeId } : {}),
          property,
          code: "INVALID_PROPERTY",
          message: `Property "${property}" is not animatable on a ${type} node.${
            hint ? ` Did you mean "${hint}"?` : ""
          } Animatable: ${animatable.join(", ")}.`,
        });
        return;
      }
      const kind = ANIMATABLE_PROPERTIES[property]!;
      const keyframes = track.keyframes;
      if (!Array.isArray(keyframes) || keyframes.length === 0) {
        this.err({
          path: `${tp}.keyframes`,
          ...(nodeId ? { nodeId } : {}),
          property,
          code: "EMPTY",
          message: `Track "${property}" must have at least one keyframe.`,
        });
        return;
      }
      let prevT = -Infinity;
      keyframes.forEach((kf, ki) => {
        const kp = `${tp}.keyframes[${ki}]`;
        if (!isObject(kf)) {
          this.err({ path: kp, ...(nodeId ? { nodeId } : {}), code: "INVALID_TYPE", message: `Keyframe must be an object.` });
          return;
        }
        for (const key of Object.keys(kf)) {
          if (!ALLOWED_KEYFRAME_KEYS.includes(key)) {
            const hint = suggest(key, ALLOWED_KEYFRAME_KEYS);
            this.err({
              path: `${kp}.${key}`,
              ...(nodeId ? { nodeId } : {}),
              property: key,
              code: "UNKNOWN_PROPERTY",
              message: `Unknown keyframe field "${key}".${hint ? ` Did you mean "${hint}"?` : ""}`,
            });
          }
        }
        if (!isFiniteNumber(kf.t) || kf.t < 0) {
          this.err({
            path: `${kp}.t`,
            ...(nodeId ? { nodeId } : {}),
            property,
            code: "INVALID_VALUE",
            message: `Keyframe "t" must be a number >= 0; got ${JSON.stringify(kf.t)}.`,
          });
        } else {
          if (kf.t <= prevT) {
            this.err({
              path: `${kp}.t`,
              ...(nodeId ? { nodeId } : {}),
              property,
              code: "NOT_ASCENDING",
              message: `Keyframe times must strictly increase; ${kf.t} does not come after ${prevT}.`,
            });
          }
          prevT = kf.t;
        }
        // value kind
        if (kind === "number") {
          if (!isFiniteNumber(kf.value)) {
            this.err({
              path: `${kp}.value`,
              ...(nodeId ? { nodeId } : {}),
              property,
              code: "INVALID_TYPE",
              message: `Keyframe value for "${property}" must be a finite number; got ${JSON.stringify(kf.value)}.`,
            });
          }
        } else {
          if (typeof kf.value !== "string" || !isParseableColor(kf.value)) {
            this.err({
              path: `${kp}.value`,
              ...(nodeId ? { nodeId } : {}),
              property,
              code: "INVALID_COLOR",
              message: `Keyframe value for "${property}" must be an interpolatable color; got ${JSON.stringify(kf.value)}.`,
            });
          }
        }
        // easing
        if (kf.easing !== undefined) this.validateEasing(kf.easing, `${kp}.easing`, nodeId, property);
      });
    });
  }

  private validateEasing(easing: unknown, path: string, nodeId: string | undefined, property: string): void {
    if (typeof easing === "string") {
      if (!EASING_NAMES.includes(easing)) {
        const hint = suggest(easing, EASING_NAMES);
        this.err({
          path,
          ...(nodeId ? { nodeId } : {}),
          property,
          code: "INVALID_EASING",
          message: `Unknown easing "${easing}".${hint ? ` Did you mean "${hint}"?` : ""}`,
        });
      }
      return;
    }
    if (Array.isArray(easing)) {
      if (easing.length !== 4 || !easing.every((n) => isFiniteNumber(n))) {
        this.err({
          path,
          ...(nodeId ? { nodeId } : {}),
          property,
          code: "INVALID_EASING",
          message: `Custom easing must be a cubic-bezier [x1, y1, x2, y2] of four numbers.`,
        });
        return;
      }
      const [x1, , x2] = easing as number[];
      if (x1! < 0 || x1! > 1 || x2! < 0 || x2! > 1) {
        this.err({
          path,
          ...(nodeId ? { nodeId } : {}),
          property,
          code: "INVALID_EASING",
          message: `Cubic-bezier x control points (x1, x2) must be within [0, 1].`,
        });
      }
      return;
    }
    this.err({
      path,
      ...(nodeId ? { nodeId } : {}),
      property,
      code: "INVALID_EASING",
      message: `easing must be a named easing or a cubic-bezier array [x1, y1, x2, y2].`,
    });
  }

  private enumProp(node: Record<string, unknown>, key: string, options: string[], path: string, nodeId: string | undefined): void {
    const v = node[key];
    if (v === undefined) return;
    if (typeof v !== "string" || !options.includes(v)) {
      this.err({
        path: `${path}.${key}`,
        ...(nodeId ? { nodeId } : {}),
        property: key,
        code: "INVALID_VALUE",
        message: `${key} must be one of: ${options.join(", ")}; got ${JSON.stringify(v)}.`,
      });
    }
  }

  private numTypeError(path: string, key: string, value: unknown, nodeId: string | undefined): void {
    this.err({
      path: `${path}.${key}`,
      ...(nodeId ? { nodeId } : {}),
      property: key,
      code: "INVALID_TYPE",
      message: `${key} must be a finite number; got ${JSON.stringify(value)}.`,
    });
  }
}

/**
 * Validate a scene spec. Returns `{ valid, errors }`; `valid` is true iff `errors`
 * is empty. Never throws on bad input — that is the whole point.
 */
export function validateScene(spec: unknown): ValidationResult {
  const v = new Validator();
  v.validate(spec);
  return { valid: v.errors.length === 0, errors: v.errors };
}

/** Validate and narrow: returns the spec typed as `SceneSpec`, or throws with a readable summary. */
export function assertValidScene(spec: unknown): SceneSpec {
  const { valid, errors } = validateScene(spec);
  if (!valid) {
    const summary = errors.map((e) => `  - [${e.code}] ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Invalid scene spec (${errors.length} error(s)):\n${summary}`);
  }
  return spec as SceneSpec;
}
