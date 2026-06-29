/**
 * Oscillators — a spring coil, a mass-spring system in simple harmonic motion, and a pendulum. The
 * showcase for the engine's spring/sine easings. Pure; SHM is precomputed as sampled keyframes (a
 * cosine), so it's deterministic + golden-safe.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import type { Point } from "./circuit.js";

/** Zig-zag coil points between two endpoints, with `coils` full zig-zags and flat leads at each end. */
export function springCoil(a: Point, b: Point, coils = 8, amp = 10): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy; // unit perpendicular
  const py = ux;
  const lead = len * 0.12;
  const bodyLen = len - 2 * lead;
  const n = Math.max(2, coils) * 2;
  const pts: Point[] = [a, { x: a.x + ux * lead, y: a.y + uy * lead }];
  for (let i = 1; i < n; i++) {
    const along = lead + (bodyLen * i) / n;
    const side = i % 2 === 0 ? -amp : amp;
    pts.push({ x: a.x + ux * along + px * side, y: a.y + uy * along + py * side });
  }
  pts.push({ x: b.x - ux * lead, y: b.y - uy * lead }, b);
  return pts;
}

export interface SpringOptions {
  id?: string;
  from: Point;
  to: Point;
  coils?: number;
  amplitude?: number;
  color?: Color;
  strokeWidth?: number;
}

/** A static spring coil between two points. */
export function spring(opts: SpringOptions): Node {
  return {
    id: opts.id ?? "spring",
    type: "polyline",
    x: 0,
    y: 0,
    points: springCoil(opts.from, opts.to, opts.coils ?? 8, opts.amplitude ?? 10),
    stroke: opts.color ?? "#475569",
    strokeWidth: opts.strokeWidth ?? 2.5,
    lineJoin: "round",
  };
}

/** Cosine-sampled SHM keyframes for a property: value = base + amp·cos(2π·t/period), over `cycles`. */
function shmKeyframes(base: number, amp: number, start: number, period: number, cycles: number, perPeriod = 20): Track["keyframes"] {
  const kf: Track["keyframes"] = [];
  const total = Math.max(1, Math.round(cycles * perPeriod));
  for (let i = 0; i <= total; i++) {
    const t = start + (i / perPeriod) * period;
    kf.push({ t, value: base + amp * Math.cos((2 * Math.PI * i) / perPeriod) });
  }
  return kf;
}

export interface MassSpringOptions {
  id?: string;
  /** Top anchor point. */
  anchor: Point;
  /** Rest length of the spring (px). */
  restLength?: number;
  /** Oscillation amplitude (px). */
  amplitude?: number;
  /** Period (sec). */
  period?: number;
  cycles?: number;
  massSize?: number;
  color?: Color;
  massColor?: Color;
  coils?: number;
}

/** A vertical mass-spring oscillating in SHM: the coil stretches/compresses as the mass bobs. */
export function massSpring(opts: MassSpringOptions): GroupNode {
  const id = opts.id ?? "ms";
  const anchor = opts.anchor;
  const L = opts.restLength ?? 120;
  const A = opts.amplitude ?? 36;
  const period = Math.max(0.2, opts.period ?? 1.4);
  const cycles = Math.max(1, opts.cycles ?? 3);
  const ms = opts.massSize ?? 46;
  const restBottom = anchor.y + L;

  // Spring stretches via scaleY anchored at the top; mass bobs in lockstep (released from stretched).
  const coil = spring({
    id: `${id}-coil`,
    from: anchor,
    to: { x: anchor.x, y: restBottom },
    coils: opts.coils ?? 9,
    color: opts.color ?? "#475569",
  });
  coil.anchor = { x: anchor.x, y: anchor.y };
  coil.scaleY = (L + A) / L;
  coil.tracks = [{ property: "scaleY", keyframes: shmKeyframes(1, A / L, 0, period, cycles) }] as Track[];

  const mass: Node = {
    id: `${id}-mass`,
    type: "rect",
    x: anchor.x - ms / 2,
    y: restBottom + A - ms / 2,
    width: ms,
    height: ms,
    radius: 6,
    fill: opts.massColor ?? "#2563eb",
    tracks: [{ property: "y", keyframes: shmKeyframes(restBottom - ms / 2, A, 0, period, cycles) }] as Track[],
  };
  // A small ceiling hatch for the anchor.
  const ceil: Node = {
    id: `${id}-ceil`,
    type: "polyline",
    x: 0,
    y: 0,
    points: [
      { x: anchor.x - 26, y: anchor.y },
      { x: anchor.x + 26, y: anchor.y },
    ],
    stroke: "#94a3b8",
    strokeWidth: 3,
  };
  return { id, type: "group", x: 0, y: 0, children: [ceil, coil, mass] };
}

export interface PendulumOptions {
  id?: string;
  pivot: Point;
  length?: number;
  /** Amplitude in degrees. */
  amplitude?: number;
  period?: number;
  cycles?: number;
  bobRadius?: number;
  color?: Color;
  bobColor?: Color;
}

/** A pendulum swinging through ±amplitude via the whole arm rotating about the pivot (easeInOutSine). */
export function pendulum(opts: PendulumOptions): GroupNode {
  const id = opts.id ?? "pend";
  const pivot = opts.pivot;
  const len = opts.length ?? 150;
  const amp = opts.amplitude ?? 30;
  const period = Math.max(0.2, opts.period ?? 1.6);
  const cycles = Math.max(1, opts.cycles ?? 3);
  const r = opts.bobRadius ?? 16;

  // Swing: rotate the arm group about the pivot, +amp → -amp → +amp per period (smooth via easeInOutSine).
  const kf: Track["keyframes"] = [{ t: 0, value: amp }];
  for (let i = 1; i <= cycles * 2; i++) kf.push({ t: (i * period) / 2, value: i % 2 === 0 ? amp : -amp, easing: "easeInOutSine" });

  const arm: GroupNode = {
    id: `${id}-arm`,
    type: "group",
    x: pivot.x,
    y: pivot.y,
    anchor: { x: 0, y: 0 },
    rotation: amp,
    tracks: [{ property: "rotation", keyframes: kf }] as Track[],
    children: [
      {
        id: `${id}-rod`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: 0, y: 0 },
          { x: 0, y: len },
        ],
        stroke: opts.color ?? "#475569",
        strokeWidth: 2.5,
      },
      { id: `${id}-bob`, type: "ellipse", x: -r, y: len - r, width: r * 2, height: r * 2, fill: opts.bobColor ?? "#dc2626" },
    ],
  };
  const pin: Node = { id: `${id}-pin`, type: "ellipse", x: pivot.x - 4, y: pivot.y - 4, width: 8, height: 8, fill: "#334155" };
  return { id, type: "group", x: 0, y: 0, children: [arm, pin] };
}
