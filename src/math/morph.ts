/**
 * Shape morphing — turn two SVG path shapes into a single `polyline` whose animatable
 * `morph` (0..1) interpolates from the first to the second. Both shapes are flattened to
 * points, resampled to a common count, and rotation-aligned so the morph travels the
 * shortest way (the flubber approach). Pure + deterministic, so the engine stays byte-exact.
 *
 * The classic move: `buildMorph({ from: appleD, to: oneD })` → "the apple becomes the 1."
 */

import type { PolylineNode, Color } from "../spec/types.js";
import { flattenPath } from "../engine/svgPath.js";
import { resamplePoints, rotateToAlign } from "./morphUtil.js";
import { getTheme } from "./shared.js";

/** Bounding-box area of a subpath, or -1 if it has any non-finite point. */
function bboxArea(s: { x: number; y: number }[]): number {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of s) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return -1;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return (maxX - minX) * (maxY - minY);
}

/**
 * Pick the dominant outline — the geometrically largest subpath (by bounding-box
 * area), not the one with the most points. Point count tracks curve complexity, not
 * size, so a big simple shape must not lose to a tiny curve-heavy one. Non-finite
 * subpaths are skipped so a degenerate input can't poison the morph.
 */
function mainSubpath(subpaths: { x: number; y: number }[][]): { x: number; y: number }[] {
  let best: { x: number; y: number }[] = [];
  let bestArea = -1;
  for (const s of subpaths) {
    if (s.length < 2) continue;
    const area = bboxArea(s);
    if (area > bestArea) {
      bestArea = area;
      best = s;
    }
  }
  return best.length >= 2
    ? best
    : [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ];
}

export interface MorphOptions {
  /** Source shape as an SVG path `d` string. */
  from: string;
  /** Target shape as an SVG path `d` string. */
  to: string;
  x?: number;
  y?: number;
  /** Points sampled around each shape (higher = smoother). Default 64. */
  samples?: number;
  stroke?: Color;
  strokeWidth?: number;
  fill?: Color;
  /** Close the shape (default true). */
  closed?: boolean;
  theme?: string;
  id?: string;
}

/**
 * A `polyline` node that morphs from one SVG shape to another via its animatable `morph`
 * property (0 = source, 1 = target). Attach a track to `morph` (see `morphIn`) to animate it.
 */
export function buildMorph(opts: MorphOptions): PolylineNode {
  const theme = getTheme(opts.theme);
  const n = Math.max(2, Math.floor(opts.samples ?? 64));
  const a = resamplePoints(mainSubpath(flattenPath(opts.from)), n, true);
  const b = rotateToAlign(a, resamplePoints(mainSubpath(flattenPath(opts.to)), n, true));
  return {
    id: opts.id ?? "morph",
    type: "polyline",
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    closed: opts.closed ?? true,
    points: a,
    morphTo: b,
    morph: 0,
    stroke: opts.stroke ?? theme.palette.primary,
    strokeWidth: opts.strokeWidth ?? 4,
    ...(opts.fill !== undefined ? { fill: opts.fill } : {}),
  };
}
