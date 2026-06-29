/**
 * Handwriting / "Write" — line art that draws itself. `writeOn` injects a draw-on `progress` track
 * into any polyline/path node; `penStroke` builds a polyline that reveals along its length with a pen
 * nib riding the drawing tip (the nib position is precomputed by arc length, so it tracks the reveal
 * exactly). Constant-speed (linear) by default, which both keeps the nib synced and reads as natural
 * handwriting. Pure + deterministic.
 */

import type { Node, GroupNode, Color, Track, EasingSpec } from "../spec/types.js";

export interface Point {
  x: number;
  y: number;
}

function segLen(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function totalLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += segLen(pts[i - 1]!, pts[i]!);
  return len;
}

/** The point at arc-length `target` along the polyline (clamped to the ends). */
function pointAtLength(pts: Point[], target: number): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (target <= 0 || pts.length === 1) return pts[0]!;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = segLen(a, b);
    if (acc + l >= target) {
      const t = l === 0 ? 0 : (target - acc) / l;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += l;
  }
  return pts[pts.length - 1]!;
}

export interface WriteOnOptions {
  start?: number;
  duration?: number;
  easing?: EasingSpec;
}

/** Add a draw-on `progress` animation (0 → 1) to an existing polyline/path node. */
export function writeOn<T extends Node>(node: T, opts: WriteOnOptions = {}): T {
  const start = opts.start ?? 0;
  const dur = opts.duration ?? 1.2;
  const track: Track = {
    property: "progress",
    keyframes: [
      { t: start, value: 0 },
      { t: start + dur, value: 1, ...(opts.easing !== undefined ? { easing: opts.easing } : {}) },
    ],
  };
  return { ...node, progress: 0, tracks: [...(node.tracks ?? []), track] };
}

export interface PenStrokeOptions {
  id?: string;
  points: Point[];
  stroke?: Color;
  strokeWidth?: number;
  start?: number;
  duration?: number;
  /** Show a nib riding the drawing tip. Default true. */
  pen?: boolean;
  penColor?: Color;
  penSize?: number;
}

/** A polyline that writes itself left-to-right along its length, with a pen nib tracking the tip. */
export function penStroke(opts: PenStrokeOptions): GroupNode {
  const id = opts.id ?? "stroke";
  const pts = opts.points;
  const stroke = opts.stroke ?? "#1e293b";
  const start = opts.start ?? 0;
  const dur = opts.duration ?? 1.2;

  const line: Node = {
    id: `${id}-line`,
    type: "polyline",
    x: 0,
    y: 0,
    points: pts,
    stroke,
    strokeWidth: opts.strokeWidth ?? 3,
    lineCap: "round",
    lineJoin: "round",
    progress: 0,
    tracks: [
      {
        property: "progress",
        keyframes: [
          { t: start, value: 0 },
          { t: start + dur, value: 1 },
        ],
      },
    ],
  };
  const children: Node[] = [line];

  if (opts.pen !== false && pts.length >= 2) {
    const total = totalLength(pts);
    const n = Math.max(8, Math.min(48, Math.round(total / 8)));
    const penSize = opts.penSize ?? 9;
    const half = penSize / 2;
    const xk: Track["keyframes"] = [];
    const yk: Track["keyframes"] = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const pt = pointAtLength(pts, f * total);
      const t = start + f * dur;
      xk.push({ t, value: pt.x - half });
      yk.push({ t, value: pt.y - half });
    }
    const first = pts[0]!;
    // The nib is hidden before its stroke starts (during a start delay) and fades out as it finishes.
    const preHide =
      start > 0.02
        ? [
            { t: 0, value: 0 },
            { t: start - 0.01, value: 0 },
          ]
        : [];
    children.push({
      id: `${id}-pen`,
      type: "ellipse",
      x: first.x - half,
      y: first.y - half,
      width: penSize,
      height: penSize,
      fill: opts.penColor ?? stroke,
      opacity: start > 0.02 ? 0 : 1,
      tracks: [
        { property: "x", keyframes: xk },
        { property: "y", keyframes: yk },
        {
          property: "opacity",
          keyframes: [...preHide, { t: start, value: 1 }, { t: start + dur - 0.05, value: 1 }, { t: start + dur, value: 0 }],
        },
      ],
    });
  }

  return { id, type: "group", x: 0, y: 0, children };
}
