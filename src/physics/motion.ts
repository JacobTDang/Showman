/**
 * Mechanics composers — projectile motion (a self-drawing trajectory with a ball that moves at
 * physically-correct speed) and energy bar charts (KE ↔ PE conservation). Pure; compose the math
 * substrate (plotParametric / movingMarker) + primitives. Deterministic + golden-safe.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import type { Plane } from "../math/index.js";
import { plotParametric, movingMarker, coordinatePlane, plotFunction } from "../math/index.js";
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

export interface MotionSeries {
  /** Axis label, e.g. "x", "v", "a". */
  label: string;
  /** Value as a function of time. */
  fn: (t: number) => number;
  color?: Color;
  yMin?: number;
  yMax?: number;
}

export interface MotionGraphOptions {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Total time on the shared x-axis. */
  tMax: number;
  /** One stacked graph per series (e.g. position / velocity / acceleration). */
  series: MotionSeries[];
  /** Trace dot on each curve + a vertical time sweep. Default true. */
  trace?: boolean;
  start?: number;
  duration?: number;
  theme?: string;
}

/**
 * Synced kinematics graphs — a stack of value-vs-time plots (x-t / v-t / a-t) that draw on in lockstep
 * over one shared time window, each with a trace dot riding the curve and a single vertical sweep line
 * crossing all of them. The canonical "moving man" motion-graph visual.
 */
export function motionGraph(opts: MotionGraphOptions): GroupNode {
  const id = opts.id ?? "motion";
  const theme = getTheme(opts.theme);
  const W = opts.width ?? 360;
  const H = opts.height ?? 360;
  const n = Math.max(1, opts.series.length);
  const gap = 18;
  const planeH = (H - gap * (n - 1)) / n;
  const start = opts.start ?? 0.2;
  const dur = Math.max(1e-3, opts.duration ?? 2);
  const trace = opts.trace !== false;
  const children: Node[] = [];

  opts.series.forEach((s, i) => {
    const py = opts.y + i * (planeH + gap);
    let yMin = s.yMin;
    let yMax = s.yMax;
    if (yMin === undefined || yMax === undefined) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k <= 40; k++) {
        const v = s.fn((opts.tMax * k) / 40);
        if (Number.isFinite(v)) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
      if (!Number.isFinite(lo)) {
        lo = 0;
        hi = 1;
      }
      const pad = (hi - lo || 1) * 0.15;
      yMin = yMin ?? lo - pad;
      yMax = yMax ?? hi + pad;
    }
    const color = s.color ?? theme.palette.swatches[i % theme.palette.swatches.length]!;
    const plane = coordinatePlane({
      id: `${id}-p${i}`,
      x: opts.x,
      y: py,
      width: W,
      height: planeH,
      xMin: 0,
      xMax: opts.tMax,
      yMin,
      yMax,
      step: (yMax - yMin) / 2,
      showGrid: false,
      showLabels: false,
    });
    const curve = plotFunction(plane, s.fn, { samples: 80 }, { id: `${id}-c${i}`, stroke: color, strokeWidth: 3 });
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
    children.push(plane.node, curve);
    children.push({
      id: `${id}-lbl${i}`,
      type: "text",
      x: opts.x + 6,
      y: py + 12,
      text: s.label,
      fontFamily: theme.bodyFont,
      fontWeight: 700,
      fontSize: 14,
      fill: color,
      align: "left",
      baseline: "middle",
    });
    if (trace)
      children.push(
        movingMarker(plane, (t) => ({ x: t, y: s.fn(t) }), {
          id: `${id}-dot${i}`,
          tMin: 0,
          tMax: opts.tMax,
          start,
          duration: dur,
          radius: 5,
          fill: color,
        }),
      );
  });

  // One vertical sweep line crossing every graph, advancing left → right over the same window.
  if (trace) {
    children.push({
      id: `${id}-sweep`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: opts.x, y: opts.y },
        { x: opts.x, y: opts.y + H },
      ],
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
      dash: [5, 4],
      tracks: [
        {
          property: "x",
          keyframes: [
            { t: start, value: 0 },
            { t: start + dur, value: W },
          ],
        },
      ] as Track[],
    });
  }
  return { id, type: "group", x: 0, y: 0, children };
}

export interface InclinedPlaneOptions {
  id?: string;
  /** Bottom-left corner of the ramp. */
  x: number;
  y: number;
  /** Incline angle in degrees. */
  angle: number;
  /** Length of the incline surface (hypotenuse) in px. Default 240. */
  length?: number;
  rampFill?: Color;
  /** Place a block on the incline. */
  block?: boolean;
  blockSize?: number;
  blockColor?: Color;
  showAngle?: boolean;
  theme?: string;
}

/** A right-triangle ramp (right angle at the bottom-right) with an optional block sitting on the
 * incline and an angle marker — the staple force-resolution / friction setup. */
export function inclinedPlane(opts: InclinedPlaneOptions): GroupNode {
  const id = opts.id ?? "ramp";
  const theme = getTheme(opts.theme);
  const a = opts.angle * DEG;
  const L = opts.length ?? 240;
  const base = L * Math.cos(a);
  const rise = L * Math.sin(a);
  const A = { x: opts.x, y: opts.y }; // bottom-left
  const B = { x: opts.x + base, y: opts.y }; // bottom-right (right angle)
  const C = { x: opts.x + base, y: opts.y - rise }; // top-right
  const children: Node[] = [
    {
      id: `${id}-tri`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [A, B, C],
      closed: true,
      fill: opts.rampFill ?? "#cbd5e1",
      stroke: theme.palette.muted,
      strokeWidth: 2,
      lineJoin: "round",
    },
  ];
  if (opts.showAngle !== false) {
    const rad = 34;
    children.push({
      id: `${id}-arc`,
      type: "arc",
      x: A.x,
      y: A.y,
      radius: rad,
      startAngle: -opts.angle,
      endAngle: 0,
      fill: "transparent",
      stroke: theme.palette.text,
      strokeWidth: 2,
    });
    children.push({
      id: `${id}-ang`,
      type: "text",
      x: A.x + rad + 10,
      y: A.y - rise * 0.12 - 6,
      text: `${Math.round(opts.angle)}°`,
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 15,
      fill: theme.palette.text,
      align: "left",
      baseline: "middle",
    });
  }
  if (opts.block) {
    const s = opts.blockSize ?? 44;
    // Sit the block flush on the incline at its midpoint, rotated by -angle.
    const mx = (A.x + C.x) / 2;
    const my = (A.y + C.y) / 2;
    const nx = Math.sin(a); // outward normal (up-left of the slope)
    const ny = -Math.cos(a);
    children.push({
      id: `${id}-block`,
      type: "rect",
      x: mx + (nx * s) / 2 - s / 2,
      y: my + (ny * s) / 2 - s / 2,
      width: s,
      height: s,
      radius: 4,
      fill: opts.blockColor ?? "#2563eb",
      rotation: -opts.angle,
      anchor: { x: s / 2, y: s / 2 },
    });
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
