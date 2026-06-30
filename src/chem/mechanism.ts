/**
 * Reaction mechanisms — curly arrows showing electron movement. A full (double-barb) arrow is a
 * curved bezier for an electron pair; a half (single-barb, "fishhook") arrow is a single-electron
 * (radical) shift. Pure builder over a path + polyline arrowhead; deterministic + golden-safe.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";

export interface Point {
  x: number;
  y: number;
}

export interface CurlyArrowOptions {
  id?: string;
  /** Start (a bond or lone pair) and end (where the electrons go). */
  from: Point;
  to: Point;
  /** Perpendicular bow height in px; sign chooses the side. Default 0.45 × distance. */
  curvature?: number;
  color?: Color;
  strokeWidth?: number;
  /** Single-barb fishhook for a single-electron (radical) move. Default false (an electron pair). */
  half?: boolean;
  arrowSize?: number;
  /** Draw the arrow on. Default false. */
  animate?: boolean;
  start?: number;
  duration?: number;
}

const rot = (vx: number, vy: number, a: number): Point => ({
  x: vx * Math.cos(a) - vy * Math.sin(a),
  y: vx * Math.sin(a) + vy * Math.cos(a),
});

/** A curly arrow (curved bezier) with a tangent-aligned barbed head, for electron-pushing mechanisms. */
export function curlyArrow(opts: CurlyArrowOptions): GroupNode {
  const id = opts.id ?? "curly";
  const color = opts.color ?? "#2563eb";
  const sw = opts.strokeWidth ?? 2.5;
  const a = opts.arrowSize ?? 12;
  const { from, to } = opts;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = opts.curvature ?? len * 0.45;
  // Control point: the midpoint pushed out along the perpendicular.
  const cx = (from.x + to.x) / 2 + (-dy / len) * bow;
  const cy = (from.y + to.y) / 2 + (dx / len) * bow;

  const path: Node = {
    id: `${id}-path`,
    type: "path",
    x: 0,
    y: 0,
    d: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`,
    stroke: color,
    strokeWidth: sw,
    fill: "transparent",
    lineCap: "round",
  };

  // Arrowhead: barbs swept back from `to` along the reversed end-tangent (from control → end).
  const tx = to.x - cx;
  const ty = to.y - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const bx = -tx / tl;
  const by = -ty / tl; // unit pointing back toward the control point
  const barbA = (30 * Math.PI) / 180; // barbs splay ~30° off the back-tangent → a V opening backward
  const b1 = rot(bx, by, barbA);
  const b2 = rot(bx, by, -barbA);
  const headPts: Point[] = opts.half
    ? [to, { x: to.x + b1.x * a, y: to.y + b1.y * a }]
    : [{ x: to.x + b1.x * a, y: to.y + b1.y * a }, to, { x: to.x + b2.x * a, y: to.y + b2.y * a }];
  const head: Node = {
    id: `${id}-head`,
    type: "polyline",
    x: 0,
    y: 0,
    points: headPts,
    stroke: color,
    strokeWidth: sw,
    lineJoin: "round",
    lineCap: "round",
  };

  const children = [path, head];
  if (opts.animate) {
    const start = opts.start ?? 0;
    const dur = Math.max(1e-3, opts.duration ?? 0.8);
    path.progress = 0;
    path.tracks = [
      {
        property: "progress",
        keyframes: [
          { t: start, value: 0 },
          { t: start + dur, value: 1, easing: "easeInOutSine" },
        ],
      },
    ] as Track[];
    head.opacity = 0;
    head.tracks = [
      {
        property: "opacity",
        keyframes: [
          { t: start + dur - 0.12, value: 0 },
          { t: start + dur, value: 1 },
        ],
      },
    ] as Track[];
  }
  return { id, type: "group", x: 0, y: 0, children };
}
