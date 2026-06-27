/**
 * Resolve a node's properties at a given time.
 *
 * A node's effective value for any property is: its static value if present,
 * overridden by the sampled value of a track targeting that property, falling back
 * to a default. This module centralizes that precedence so the renderer just asks
 * "what is `width` at t?" and never re-implements the rule.
 */

import type { Node, Track } from "../spec/types.js";
import { ANIMATABLE_PROPERTIES, TRANSFORM_DEFAULTS } from "../spec/schema.js";
import { sampleTrack } from "./interpolate.js";

/** A node's fully-resolved base transform at a point in time. */
export interface ResolvedTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  anchorX: number;
  anchorY: number;
}

/** Build a quick lookup of property -> track for a node. */
function trackMap(node: Node): Map<string, Track> {
  const m = new Map<string, Track>();
  const tracks = (node as { tracks?: Track[] }).tracks;
  if (tracks) {
    for (const tr of tracks) m.set(tr.property, tr);
  }
  return m;
}

/**
 * A resolver bound to one node at one time. `num`/`color` read a property,
 * preferring an active track, then the node's static value, then a fallback.
 */
export class NodeResolver {
  private readonly tracks: Map<string, Track>;
  private readonly props: Record<string, unknown>;

  constructor(
    node: Node,
    private readonly t: number,
  ) {
    this.tracks = trackMap(node);
    this.props = node as unknown as Record<string, unknown>;
  }

  /** Resolve a numeric property. */
  num(name: string, fallback: number): number {
    const tr = this.tracks.get(name);
    if (tr && ANIMATABLE_PROPERTIES[name] === "number") {
      return sampleTrack(tr, this.t, "number") as number;
    }
    const v = this.props[name];
    return typeof v === "number" ? v : fallback;
  }

  /** Resolve a numeric property that may be absent (returns `undefined` if unset and no track). */
  numOpt(name: string): number | undefined {
    const tr = this.tracks.get(name);
    if (tr && ANIMATABLE_PROPERTIES[name] === "number") {
      return sampleTrack(tr, this.t, "number") as number;
    }
    const v = this.props[name];
    return typeof v === "number" ? v : undefined;
  }

  /** Resolve a color property to a canvas-ready string, or `undefined` if unset. */
  color(name: string): string | undefined {
    const tr = this.tracks.get(name);
    if (tr && ANIMATABLE_PROPERTIES[name] === "color") {
      return sampleTrack(tr, this.t, "color") as string;
    }
    const v = this.props[name];
    return typeof v === "string" ? v : undefined;
  }

  /** Resolve a string property (non-animatable), or `undefined`. */
  str(name: string): string | undefined {
    const v = this.props[name];
    return typeof v === "string" ? v : undefined;
  }

  /** Read a raw (non-animatable) property value of unknown type. */
  raw(name: string): unknown {
    return this.props[name];
  }
}

/** Resolve the base transform for a node at time `t`, applying scale/anchor fallbacks. */
export function resolveTransform(node: Node, t: number): ResolvedTransform {
  const r = new NodeResolver(node, t);
  const scale = r.num("scale", TRANSFORM_DEFAULTS.scale);
  const anchor = (node as { anchor?: { x: number; y: number } }).anchor;
  return {
    x: r.num("x", TRANSFORM_DEFAULTS.x),
    y: r.num("y", TRANSFORM_DEFAULTS.y),
    rotation: r.num("rotation", TRANSFORM_DEFAULTS.rotation),
    scaleX: r.numOpt("scaleX") ?? scale,
    scaleY: r.numOpt("scaleY") ?? scale,
    opacity: clampUnit(r.num("opacity", TRANSFORM_DEFAULTS.opacity)),
    anchorX: anchor?.x ?? TRANSFORM_DEFAULTS.anchorX,
    anchorY: anchor?.y ?? TRANSFORM_DEFAULTS.anchorY,
  };
}

function clampUnit(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
