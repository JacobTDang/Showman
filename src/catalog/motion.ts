/**
 * Kind-aware motion for assembled scenes (Graph Perfection P1).
 *
 * Turns a static builder output into something that moves the way the hand-built
 * lessons do, deterministically and golden-safe (transform / opacity / progress /
 * value / endAngle tracks only — no blurs, no soft-alpha areas):
 *
 *   - ENTRANCE on the placement group: `popIn` by default, `fadeIn` when the subtree
 *     will draw itself on (drawing + scaling at once reads as busy), or whatever the
 *     placement's `animate` hint requests. "none" opts out entirely.
 *   - CONTENT BEATS inside the subtree: polylines/paths draw on (`progress`), counters
 *     count up (`value`), arcs sweep in (`endAngle`) — staggered node by node, starting
 *     as the entrance settles. Nodes that already carry builder-authored tracks are
 *     never touched (the builder knows best).
 */

import type { Node, Track } from "../spec/types.js";
import { fadeIn, popIn, springIn, spinIn, typewriter } from "../motion/presets.js";
import { drawOn, shadeIn, countUp } from "../math/presets.js";

/** Entrance hints a placement may request. "auto" picks by content; "none" opts out. */
export const ANIMATE_HINTS = ["auto", "none", "fadeIn", "popIn", "springIn", "spinIn"] as const;
export type AnimateHint = (typeof ANIMATE_HINTS)[number];

/** Content-animated nodes per placement are capped to bound spec size. */
const MAX_CONTENT_BEATS = 12;
const CONTENT_STAGGER = 0.18;
const CONTENT_DURATION = 0.9;

const ENTRANCE_DURATION: Record<Exclude<AnimateHint, "none" | "auto">, number> = {
  fadeIn: 0.45,
  popIn: 0.55,
  springIn: 0.7,
  spinIn: 0.5,
};

export interface PlacementMotion {
  /** Tracks for the placement's outer group (the entrance). */
  entrance: Track[];
  /** The subtree with content-beat tracks attached (same tree when hint is "none"). */
  node: Node;
  /** When the last emitted keyframe lands, in seconds (0 when nothing animates). */
  end: number;
}

/**
 * Plan the motion for one placement. `start` is the entrance start (the caller
 * staggers placements); `staticScale` is the placement's resting scale so scale
 * entrances settle at it rather than at 1.
 */
export function planPlacementMotion(node: Node, hint: AnimateHint | undefined, start: number, staticScale = 1): PlacementMotion {
  const h = hint ?? "auto";
  if (h === "none") return { entrance: [], node, end: 0 };

  const targets = collectContentTargets(node);
  const entranceKind: Exclude<AnimateHint, "none" | "auto"> =
    h === "auto" ? (targets.some((t) => t.kind === "draw") ? "fadeIn" : "popIn") : h;

  const entranceDur = ENTRANCE_DURATION[entranceKind];
  let entrance = makeEntrance(entranceKind, start, entranceDur);
  if (staticScale !== 1) entrance = settleScaleAt(entrance, staticScale);

  const contentStart = start + entranceDur * 0.7; // overlap slightly: motion reads as continuous
  let end = start + entranceDur;
  targets.slice(0, MAX_CONTENT_BEATS).forEach((target, k) => {
    const beatStart = contentStart + k * CONTENT_STAGGER;
    const tracks = makeContentBeat(target, beatStart);
    if (tracks.length === 0) return;
    target.node.tracks = tracks;
    end = Math.max(end, tracksEnd(tracks));
  });

  return { entrance, node, end };
}

/** A typewriter reveal for the scene title, paced by text length. */
export function titleReveal(text: string): Track[] {
  const duration = Math.min(1.6, Math.max(0.6, text.length * 0.045));
  return typewriter({ start: 0, duration });
}

/** The latest keyframe time across tracks. */
export function tracksEnd(tracks: Track[]): number {
  let end = 0;
  for (const track of tracks) for (const kf of track.keyframes) end = Math.max(end, kf.t);
  return end;
}

function makeEntrance(kind: Exclude<AnimateHint, "none" | "auto">, start: number, duration: number): Track[] {
  switch (kind) {
    case "fadeIn":
      return fadeIn({ start, duration });
    case "springIn":
      return springIn({ start, duration });
    case "spinIn":
      return spinIn({ start, duration });
    default:
      return popIn({ start, duration });
  }
}

/** Rescale an entrance's scale keyframes so they settle at the placement's static scale. */
function settleScaleAt(tracks: Track[], scale: number): Track[] {
  return tracks.map((track) =>
    track.property === "scale"
      ? { ...track, keyframes: track.keyframes.map((kf) => ({ ...kf, value: (kf.value as number) * scale })) }
      : track,
  );
}

type ContentKind = "draw" | "count" | "sweep";

interface ContentTarget {
  kind: ContentKind;
  node: Node;
}

/**
 * Find the animatable content nodes in a subtree, in deterministic tree order.
 * Nodes with builder-authored tracks (or a static partial `progress`) are skipped.
 */
function collectContentTargets(root: Node): ContentTarget[] {
  const out: ContentTarget[] = [];
  walk(root, (node) => {
    if (node.tracks && node.tracks.length > 0) return;
    if ((node.type === "polyline" || node.type === "path") && node.progress === undefined) {
      out.push({ kind: "draw", node });
    } else if (node.type === "counter" && typeof node.value === "number" && node.value !== 0) {
      out.push({ kind: "count", node });
    } else if (node.type === "arc" && typeof node.endAngle === "number" && node.endAngle !== (node.startAngle ?? 0)) {
      out.push({ kind: "sweep", node });
    }
  });
  return out;
}

function makeContentBeat(target: ContentTarget, start: number): Track[] {
  switch (target.kind) {
    case "draw":
      return drawOn({ start, duration: CONTENT_DURATION });
    case "count":
      return countUp({
        start,
        duration: CONTENT_DURATION,
        from: 0,
        to: target.node.type === "counter" ? (target.node.value as number) : 0,
      });
    case "sweep": {
      if (target.node.type !== "arc") return [];
      return shadeIn({ start, duration: CONTENT_DURATION, from: target.node.startAngle ?? 0, to: target.node.endAngle as number });
    }
  }
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  if (node.type === "group") for (const child of node.children) walk(child, visit);
}
