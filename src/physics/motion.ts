/**
 * Mechanics composers — projectile motion (a self-drawing trajectory with a ball that moves at
 * physically-correct speed) and energy bar charts (KE ↔ PE conservation). Pure; compose the math
 * substrate (plotParametric / movingMarker) + primitives. Deterministic + golden-safe.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import type { Plane } from "../math/index.js";
import { plotParametric, movingMarker } from "../math/index.js";
import { getTheme } from "../theme/themes.js";

const DEG = Math.PI / 180;

export interface ProjectileOptions {
  id?: string;
  /** Launch speed (data units/sec) and angle (degrees from +x). */
  speed: number;
  angle: number;
  /** Gravity (data units/sec²). Default 9.8. */
  g?: number;
  /** Launch point in data coords. Default {x:0,y:0}. */
  origin?: { x: number; y: number };
  showTrajectory?: boolean;
  showMarker?: boolean;
  color?: Color;
  markerColor?: Color;
  markerRadius?: number;
  /** Draw the path on + move the ball over this window. Default true. */
  animate?: boolean;
  start?: number;
  duration?: number;
  samples?: number;
}

export function projectile(plane: Plane, opts: ProjectileOptions): GroupNode {
  const id = opts.id ?? "proj";
  const g = opts.g ?? 9.8;
  const o = opts.origin ?? { x: 0, y: 0 };
  const rad = opts.angle * DEG;
  const vx = opts.speed * Math.cos(rad);
  const vy = opts.speed * Math.sin(rad);
  const flight = vy > 0 && g > 0 ? (2 * vy) / g : 1; // time to return to launch height
  const traj = (t: number): { x: number; y: number } => ({ x: o.x + vx * t, y: o.y + vy * t - 0.5 * g * t * t });
  const start = opts.start ?? 0;
  const dur = Math.max(1e-3, opts.duration ?? 2);
  const animate = opts.animate !== false;
  const color = opts.color ?? "#2563eb";
  const children: Node[] = [];

  if (opts.showTrajectory !== false) {
    const curve = plotParametric(
      plane,
      traj,
      { tMin: 0, tMax: flight, samples: opts.samples ?? 96 },
      { id: `${id}-path`, stroke: color, strokeWidth: 4 },
    );
    if (animate) {
      // Linear progress so the drawn tip stays locked to the ball's position over the same window.
      curve.progress = 0;
      curve.tracks = [
        {
          property: "progress",
          keyframes: [
            { t: start, value: 0 },
            { t: start + dur, value: 1 },
          ],
        },
      ] as Track[];
    }
    children.push(curve);
  }
  if (opts.showMarker !== false) {
    children.push(
      movingMarker(plane, traj, {
        id: `${id}-ball`,
        tMin: 0,
        tMax: flight,
        ...(animate ? { start, duration: dur } : { start, duration: 1e-3 }),
        radius: opts.markerRadius ?? 8,
        fill: opts.markerColor ?? "#f59e0b",
        samples: opts.samples ?? 60,
      }),
    );
  }
  return { id, type: "group", x: 0, y: 0, children };
}

export interface EnergyBar {
  label: string;
  value: number;
  color?: Color;
}

export interface EnergyBarsOptions {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  bars: EnergyBar[];
  /** Axis maximum. Default = the largest bar value (or sum, for a total). */
  max?: number;
  theme?: string;
  /** Grow the bars up on. Default false. */
  animate?: boolean;
}

/** A small bar chart for energy accounting (KE / PE / thermal …) — central to conservation lessons. */
export function energyBars(opts: EnergyBarsOptions): GroupNode {
  const id = opts.id ?? "energy";
  const theme = getTheme(opts.theme);
  const w = opts.width ?? 260;
  const h = opts.height ?? 180;
  const n = Math.max(1, opts.bars.length);
  const max = opts.max ?? Math.max(1, ...opts.bars.map((b) => b.value));
  const gap = 16;
  const barW = Math.max(6, (w - gap * (n + 1)) / n);
  const baseY = opts.y + h;
  const children: Node[] = [
    {
      id: `${id}-axis`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: opts.x, y: baseY },
        { x: opts.x + w, y: baseY },
      ],
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
    },
  ];
  opts.bars.forEach((b, i) => {
    const bx = opts.x + gap + i * (barW + gap);
    const bh = Math.max(0, (Math.min(b.value, max) / max) * (h - 24));
    const fill = b.color ?? theme.palette.swatches[i % theme.palette.swatches.length]!;
    const bar: Node = { id: `${id}-bar-${i}`, type: "rect", x: bx, y: baseY - bh, width: barW, height: bh, radius: 4, fill };
    if (opts.animate && bh > 0) {
      bar.anchor = { x: barW / 2, y: bh };
      bar.tracks = [
        {
          property: "scaleY",
          keyframes: [
            { t: 0.1 + i * 0.08, value: 0 },
            { t: 0.6 + i * 0.08, value: 1, easing: "easeOutCubic" },
          ],
        },
      ] as Track[];
    }
    children.push(bar);
    if (b.label.trim() !== "") {
      children.push({
        id: `${id}-lbl-${i}`,
        type: "text",
        x: bx + barW / 2,
        y: baseY + 14,
        text: b.label,
        fontFamily: theme.bodyFont,
        fontWeight: theme.bodyWeight,
        fontSize: 14,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
      });
    }
  });
  return { id, type: "group", x: 0, y: 0, children };
}
