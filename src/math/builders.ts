/**
 * Composite math builders — compose the engine primitives (polyline, arc, counter,
 * ellipse, rect, text) into ready-made, themeable math visuals. Each returns a
 * GroupNode (or richer handle) you drop into a scene's `nodes`. Graphs precompute
 * their sample points here, at build time, so the spec stays pure JSON.
 *
 * Ids are namespaced by an `id` prefix per builder; pass distinct prefixes if you
 * use two of the same builder in one scene.
 */

import type { Node, GroupNode, PolylineNode, Color } from "../spec/types.js";
import { getTheme, idGen, fmtTick, clamp, finiteNum, posSize, intCount, type Theme } from "./shared.js";

// ───────────────────────── Coordinate plane + graphing (algebra) ─────────────────────────

export interface PlaneOptions {
  id?: string;
  /** Top-left placement of the plotting box. */
  x?: number;
  y?: number;
  /** Pixel size of the plotting box. */
  width?: number;
  height?: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Grid/tick step in data units. Default 1. */
  step?: number;
  theme?: string;
  showGrid?: boolean;
  showLabels?: boolean;
}

export interface Plane {
  /** Add this to `scene.nodes`. */
  node: GroupNode;
  originX: number;
  originY: number;
  idPrefix: string;
  range: { xMin: number; xMax: number; yMin: number; yMax: number };
  theme: Theme;
  /** Map data coords -> local pixels (relative to the plane origin; plot nodes share that origin). */
  toLocal(dataX: number, dataY: number): { x: number; y: number };
}

/** A themed coordinate plane: gridlines + axes + tick labels. The canvas you graph onto. */
export function coordinatePlane(opts: PlaneOptions): Plane {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "plane";
  const nid = idGen(prefix);
  const x = finiteNum(opts.x, 0);
  const y = finiteNum(opts.y, 0);
  const w = posSize(opts.width, 360);
  const h = posSize(opts.height, 300);
  // Sanitize the data range: every coord must be finite, and a zero/degenerate span
  // would make toLocal divide by zero → non-finite point coords (an invalid spec).
  const xMin = finiteNum(opts.xMin, 0);
  const xMax = finiteNum(opts.xMax, 10);
  const yMin = finiteNum(opts.yMin, 0);
  const yMax = finiteNum(opts.yMax, 10);
  const spanX = xMax - xMin !== 0 ? xMax - xMin : 1;
  const spanY = yMax - yMin !== 0 ? yMax - yMin : 1;
  // A non-positive/non-finite step would make the tick loops spin forever.
  const stepRaw = finiteNum(opts.step, 1);
  const step = stepRaw > 0 ? stepRaw : 1;
  const toLocal = (dx: number, dy: number) => ({
    x: ((dx - xMin) / spanX) * w,
    y: h - ((dy - yMin) / spanY) * h,
  });

  const children: Node[] = [];
  const ticks = (min: number, max: number) => {
    const out: number[] = [];
    // Bound the iteration count so a tiny step over a huge range can't hang / OOM.
    let count = 0;
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9 && count < 1000; v += step, count++) {
      out.push(Math.round(v / step) * step);
    }
    return out;
  };

  if (opts.showGrid !== false) {
    for (const gx of ticks(xMin, xMax)) {
      const p = toLocal(gx, yMin);
      const q = toLocal(gx, yMax);
      children.push({
        id: nid(),
        type: "polyline",
        points: [
          { x: p.x, y: p.y },
          { x: q.x, y: q.y },
        ],
        stroke: theme.palette.muted,
        strokeWidth: 1,
        opacity: 0.3,
      });
    }
    for (const gy of ticks(yMin, yMax)) {
      const p = toLocal(xMin, gy);
      const q = toLocal(xMax, gy);
      children.push({
        id: nid(),
        type: "polyline",
        points: [
          { x: p.x, y: p.y },
          { x: q.x, y: q.y },
        ],
        stroke: theme.palette.muted,
        strokeWidth: 1,
        opacity: 0.3,
      });
    }
  }

  // Axes (only when 0 is in range).
  if (yMin <= 0 && yMax >= 0) {
    const p = toLocal(xMin, 0);
    const q = toLocal(xMax, 0);
    children.push({
      id: nid(),
      type: "polyline",
      points: [
        { x: p.x, y: p.y },
        { x: q.x, y: q.y },
      ],
      stroke: theme.palette.text,
      strokeWidth: 3,
    });
  }
  if (xMin <= 0 && xMax >= 0) {
    const p = toLocal(0, yMin);
    const q = toLocal(0, yMax);
    children.push({
      id: nid(),
      type: "polyline",
      points: [
        { x: p.x, y: p.y },
        { x: q.x, y: q.y },
      ],
      stroke: theme.palette.text,
      strokeWidth: 3,
    });
  }

  if (opts.showLabels !== false) {
    const axisY = clamp(toLocal(0, 0).y, 0, h);
    for (const gx of ticks(xMin, xMax)) {
      if (Math.abs(gx) < 1e-9) continue;
      const p = toLocal(gx, 0);
      children.push({
        id: nid(),
        type: "text",
        x: p.x,
        y: axisY + 16,
        text: fmtTick(gx),
        fontSize: 15,
        fontFamily: theme.bodyFont,
        fill: theme.palette.muted,
        align: "center",
        baseline: "middle",
      });
    }
    const axisX = clamp(toLocal(0, 0).x, 0, w);
    for (const gy of ticks(yMin, yMax)) {
      if (Math.abs(gy) < 1e-9) continue;
      const p = toLocal(0, gy);
      children.push({
        id: nid(),
        type: "text",
        x: axisX - 14,
        y: p.y,
        text: fmtTick(gy),
        fontSize: 15,
        fontFamily: theme.bodyFont,
        fill: theme.palette.muted,
        align: "right",
        baseline: "middle",
      });
    }
  }

  return {
    node: { id: prefix, type: "group", x, y, children },
    originX: x,
    originY: y,
    idPrefix: prefix,
    range: { xMin, xMax, yMin, yMax },
    theme,
    toLocal,
  };
}

export interface PlotStyle {
  stroke?: Color;
  strokeWidth?: number;
  id?: string;
}

/** Plot y = f(x) over the plane's x-range (f is evaluated here, at build time → points). */
export function plotFunction(
  plane: Plane,
  fn: (x: number) => number,
  opts: { samples?: number; xMin?: number; xMax?: number } = {},
  style: PlotStyle = {},
): PolylineNode {
  const samples = intCount(opts.samples, 80);
  const xMin = finiteNum(opts.xMin, plane.range.xMin);
  const xMax = finiteNum(opts.xMax, plane.range.xMax);
  // Skip out-of-range samples so a curve/line clips cleanly at the box edge instead
  // of flattening along it; fall back to clamped points if nothing is in range.
  const eps = (plane.range.yMax - plane.range.yMin) * 1e-9;
  const inRange: { x: number; y: number }[] = [];
  const clamped: { x: number; y: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const dx = samples > 0 ? xMin + ((xMax - xMin) * i) / samples : xMin;
    const dyRaw = fn(dx);
    // Drop non-finite results (asymptotes, 1/0, log of negatives) from BOTH arrays so
    // no NaN/Infinity coordinate can reach the spec.
    if (!Number.isFinite(dyRaw)) continue;
    clamped.push(plane.toLocal(dx, clamp(dyRaw, plane.range.yMin, plane.range.yMax)));
    if (dyRaw >= plane.range.yMin - eps && dyRaw <= plane.range.yMax + eps) inRange.push(plane.toLocal(dx, dyRaw));
  }
  let points = inRange.length >= 2 ? inRange : clamped;
  // A polyline needs >= 2 finite points; if the function was non-finite almost
  // everywhere, fall back to a minimal flat segment so the spec stays valid.
  if (points.length < 2) {
    points = [plane.toLocal(xMin, plane.range.yMin), plane.toLocal(xMax, plane.range.yMin)];
  }
  return {
    id: style.id ?? `${plane.idPrefix}-fn`,
    type: "polyline",
    x: plane.originX,
    y: plane.originY,
    points,
    stroke: style.stroke ?? plane.theme.palette.primary,
    strokeWidth: style.strokeWidth ?? 4,
    lineJoin: "round",
  };
}

/** Plot a straight line y = mx + b (sampled finely so it clips to the box edges). */
export function plotLine(plane: Plane, line: { m: number; b: number }, style: PlotStyle = {}): PolylineNode {
  return plotFunction(plane, (x) => line.m * x + line.b, { samples: 64 }, { id: `${plane.idPrefix}-line`, ...style });
}

/** Plot data points as dots (with optional labels). */
export function plotPoints(
  plane: Plane,
  points: { x: number; y: number; label?: string }[],
  style: { radius?: number; fill?: Color; id?: string } = {},
): Node[] {
  const nid = idGen(style.id ?? `${plane.idPrefix}-pt`);
  const r = posSize(style.radius, 6);
  const out: Node[] = [];
  for (const p of points) {
    const loc = plane.toLocal(finiteNum(p.x, 0), finiteNum(p.y, 0));
    out.push({
      id: nid(),
      type: "ellipse",
      x: plane.originX + loc.x - r,
      y: plane.originY + loc.y - r,
      width: r * 2,
      height: r * 2,
      fill: style.fill ?? plane.theme.palette.accent,
    });
    if (p.label) {
      out.push({
        id: nid(),
        type: "text",
        x: plane.originX + loc.x + r + 4,
        y: plane.originY + loc.y - r,
        text: p.label,
        fontSize: 14,
        fontFamily: plane.theme.bodyFont,
        fill: plane.theme.palette.text,
        align: "left",
        baseline: "middle",
      });
    }
  }
  return out;
}

// ───────────────────────── Number line ─────────────────────────

export interface NumberLineOptions {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  from: number;
  to: number;
  step?: number;
  theme?: string;
}

export interface NumberLine {
  node: GroupNode;
  originX: number;
  originY: number;
  /** Local x for a value (the baseline y is 0 in local space). */
  toX(value: number): number;
}

/** A horizontal number line with ticks + labels. `toX` maps a value to a local x for markers/hops. */
export function numberLine(opts: NumberLineOptions): NumberLine {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "numline";
  const nid = idGen(prefix);
  const x = finiteNum(opts.x, 0);
  const y = finiteNum(opts.y, 0);
  const w = posSize(opts.width, 400);
  const from = finiteNum(opts.from, 0);
  const to = finiteNum(opts.to, 10);
  // Guard the denominator of toX: from==to (or non-finite) would divide by zero.
  const span = to - from !== 0 ? to - from : 1;
  const stepRaw = finiteNum(opts.step, 1);
  const step = stepRaw > 0 ? stepRaw : 1;
  const toX = (v: number) => ((v - from) / span) * w;

  const children: Node[] = [
    {
      id: nid(),
      type: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: w, y: 0 },
      ],
      stroke: theme.palette.text,
      strokeWidth: 3,
      lineCap: "round",
    },
  ];
  let tickCount = 0;
  for (let v = from; v <= to + 1e-9 && tickCount < 1000; v += step, tickCount++) {
    const px = toX(v);
    children.push({
      id: nid(),
      type: "polyline",
      points: [
        { x: px, y: -7 },
        { x: px, y: 7 },
      ],
      stroke: theme.palette.text,
      strokeWidth: 2,
    });
    children.push({
      id: nid(),
      type: "text",
      x: px,
      y: 24,
      text: fmtTick(v),
      fontSize: 18,
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
    });
  }
  return { node: { id: prefix, type: "group", x, y, children }, originX: x, originY: y, toX };
}

// ───────────────────────── Fractions ─────────────────────────

export interface FractionOptions {
  id?: string;
  x?: number;
  y?: number;
  radius?: number;
  numerator: number;
  denominator: number;
  theme?: string;
  fill?: Color;
}

/** A fraction as a pie: whole outline + `numerator/denominator` filled + part dividers. */
export function fractionCircle(opts: FractionOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "frac";
  const nid = idGen(prefix);
  const r = posSize(opts.radius, 70);
  // intCount keeps the divider loop bounded and the denominator a finite integer >= 1
  // (Math.max(1, Math.floor(NaN)) is NaN — not safe on its own).
  const denom = Math.max(1, intCount(opts.denominator, 1));
  const num = clamp(Math.floor(finiteNum(opts.numerator, 0)), 0, denom);
  const fill = opts.fill ?? theme.palette.accent;
  const cx = r;
  const cy = r;

  const children: Node[] = [
    // whole outline
    {
      id: nid(),
      type: "ellipse",
      x: 0,
      y: 0,
      width: r * 2,
      height: r * 2,
      fill: "transparent",
      stroke: theme.palette.muted,
      strokeWidth: 4,
    },
    // filled portion
    { id: nid(), type: "arc", x: 0, y: 0, radius: r, startAngle: 0, endAngle: (num / denom) * 360, fill },
  ];
  // part dividers (center -> edge)
  for (let i = 0; i < denom; i++) {
    const a = (i / denom) * 360 - 90;
    const rad = (a * Math.PI) / 180;
    children.push({
      id: nid(),
      type: "polyline",
      points: [
        { x: cx, y: cy },
        { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) },
      ],
      stroke: theme.palette.bg,
      strokeWidth: 2,
    });
  }
  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}

/** A fraction as a divided bar: `denominator` cells, first `numerator` filled. */
export function fractionBar(opts: FractionOptions & { width?: number; height?: number }): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "fracbar";
  const nid = idGen(prefix);
  const w = posSize(opts.width, 280);
  const h = posSize(opts.height, 64);
  // intCount keeps the cell loop bounded and the denominator a finite integer >= 1.
  const denom = Math.max(1, intCount(opts.denominator, 1));
  const num = clamp(Math.floor(finiteNum(opts.numerator, 0)), 0, denom);
  const fill = opts.fill ?? theme.palette.accent;
  const cellW = w / denom;

  const children: Node[] = [];
  for (let i = 0; i < denom; i++) {
    children.push({
      id: nid(),
      type: "rect",
      x: i * cellW,
      y: 0,
      width: cellW,
      height: h,
      fill: i < num ? fill : "transparent",
      stroke: theme.palette.muted,
      strokeWidth: 2,
    });
  }
  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
