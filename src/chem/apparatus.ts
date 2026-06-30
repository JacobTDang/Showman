/**
 * Lab apparatus — glassware symbols (beaker, Erlenmeyer + round-bottom flask, test tube, graduated
 * cylinder, funnel, Bunsen burner) drawn as outlines with an optional liquid fill. Pure builders over
 * polyline + rect + ellipse; deterministic + golden-safe. Each returns a GroupNode positioned at its
 * bottom-centre `(x, y)` so pieces line up on a bench.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";

export interface GlasswareOptions {
  id?: string;
  /** Bottom-centre anchor. */
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Liquid fill level, 0–1 of the body height. */
  liquid?: number;
  liquidColor?: Color;
  /** Glass outline color. */
  color?: Color;
}

const GLASS = "#94a3b8";
const LIQUID = "#7dd3fc";
const clampLevel = (v: number | undefined): number => Math.min(1, Math.max(0, v ?? 0));

/** A beaker: straight walls, a flat base, and a pouring spout, with optional liquid. */
export function beaker(opts: GlasswareOptions): GroupNode {
  const id = opts.id ?? "beaker";
  const w = opts.width ?? 90;
  const h = opts.height ?? 110;
  const color = opts.color ?? GLASS;
  const bx = opts.x - w / 2;
  const by = opts.y - h;
  const lvl = clampLevel(opts.liquid);
  const children: Node[] = [];
  if (lvl > 0) {
    const lh = lvl * (h - 8);
    children.push({
      id: `${id}-liq`,
      type: "rect",
      x: bx + 3,
      y: opts.y - lh,
      width: w - 6,
      height: lh,
      fill: opts.liquidColor ?? LIQUID,
      opacity: 0.85,
    });
  }
  // Outline: spout, down the left wall, across the base, up the right wall.
  children.push({
    id: `${id}-out`,
    type: "polyline",
    x: 0,
    y: 0,
    points: [
      { x: bx - 6, y: by - 4 },
      { x: bx, y: by + 4 },
      { x: bx, y: opts.y },
      { x: bx + w, y: opts.y },
      { x: bx + w, y: by + 4 },
    ],
    stroke: color,
    strokeWidth: 2.5,
    lineJoin: "round",
  });
  return { id, type: "group", x: 0, y: 0, children };
}

/** An Erlenmeyer (conical) flask. */
export function erlenmeyerFlask(opts: GlasswareOptions): GroupNode {
  const id = opts.id ?? "flask";
  const w = opts.width ?? 96;
  const h = opts.height ?? 120;
  const color = opts.color ?? GLASS;
  const neckW = w * 0.28;
  const neckH = h * 0.3;
  const cx = opts.x;
  const top = opts.y - h;
  const shoulder = opts.y - h + neckH;
  const lvl = clampLevel(opts.liquid);
  const children: Node[] = [];
  if (lvl > 0) {
    const bodyH = h - neckH;
    const liqTop = opts.y - lvl * bodyH;
    // Liquid is the trapezoid of the cone below liqTop (width grows toward the base).
    const span = opts.y - shoulder || 1; // guard a 0-height flask (avoids a 0/0 NaN)
    const wAt = (y: number): number => {
      const t = (y - shoulder) / span; // 0 at shoulder, 1 at base
      return neckW + (w - neckW) * Math.max(0, Math.min(1, t));
    };
    const wt = wAt(liqTop) / 2;
    children.push({
      id: `${id}-liq`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cx - wt, y: liqTop },
        { x: cx + wt, y: liqTop },
        { x: cx + w / 2 - 3, y: opts.y - 3 },
        { x: cx - w / 2 + 3, y: opts.y - 3 },
      ],
      closed: true,
      fill: opts.liquidColor ?? LIQUID,
      opacity: 0.85,
    });
  }
  children.push({
    id: `${id}-out`,
    type: "polyline",
    x: 0,
    y: 0,
    points: [
      { x: cx - neckW / 2, y: top },
      { x: cx - neckW / 2, y: shoulder },
      { x: cx - w / 2, y: opts.y },
      { x: cx + w / 2, y: opts.y },
      { x: cx + neckW / 2, y: shoulder },
      { x: cx + neckW / 2, y: top },
    ],
    stroke: color,
    strokeWidth: 2.5,
    lineJoin: "round",
  });
  return { id, type: "group", x: 0, y: 0, children };
}

/** A round-bottom flask: a spherical body with a straight neck. */
export function roundFlask(opts: GlasswareOptions): GroupNode {
  const id = opts.id ?? "rflask";
  const w = opts.width ?? 96;
  const h = opts.height ?? 120;
  const color = opts.color ?? GLASS;
  const r = w / 2;
  const neckW = w * 0.26;
  const cx = opts.x;
  const cy = opts.y - r; // bulb centre
  const top = opts.y - h;
  const children: Node[] = [
    {
      id: `${id}-bulb`,
      type: "ellipse",
      x: cx - r,
      y: cy - r,
      width: r * 2,
      height: r * 2,
      fill: "transparent",
      stroke: color,
      strokeWidth: 2.5,
    },
    {
      id: `${id}-neck`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cx - neckW / 2, y: top },
        { x: cx - neckW / 2, y: cy - r * 0.7 },
      ],
      stroke: color,
      strokeWidth: 2.5,
    },
    {
      id: `${id}-neck2`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cx + neckW / 2, y: top },
        { x: cx + neckW / 2, y: cy - r * 0.7 },
      ],
      stroke: color,
      strokeWidth: 2.5,
    },
  ];
  const lvl = clampLevel(opts.liquid);
  if (lvl > 0)
    children.unshift({
      id: `${id}-liq`,
      type: "ellipse",
      x: cx - r * 0.78,
      y: opts.y - r * 1.4 * lvl - 2,
      width: r * 1.56,
      height: r * 1.4 * lvl,
      fill: opts.liquidColor ?? LIQUID,
      opacity: 0.85,
    });
  return { id, type: "group", x: 0, y: 0, children };
}

/** A test tube: a narrow tube with a rounded bottom. */
export function testTube(opts: GlasswareOptions): GroupNode {
  const id = opts.id ?? "tube";
  const w = opts.width ?? 32;
  const h = opts.height ?? 120;
  const color = opts.color ?? GLASS;
  const cx = opts.x;
  const top = opts.y - h;
  const r = w / 2;
  const lvl = clampLevel(opts.liquid);
  const children: Node[] = [];
  if (lvl > 0) {
    const lh = lvl * (h - r);
    children.push({
      id: `${id}-liq`,
      type: "rect",
      x: cx - r + 2,
      y: opts.y - r - lh,
      width: w - 4,
      height: lh + r * 0.6,
      fill: opts.liquidColor ?? LIQUID,
      opacity: 0.85,
    });
    children.push({
      id: `${id}-liqb`,
      type: "ellipse",
      x: cx - r + 2,
      y: opts.y - r * 2 + 1,
      width: w - 4,
      height: r * 1.5,
      fill: opts.liquidColor ?? LIQUID,
      opacity: 0.85,
    });
  }
  // Walls + a semicircular bottom (sampled arc).
  const bottom: { x: number; y: number }[] = [];
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI - (Math.PI * k) / 12;
    bottom.push({ x: cx - r * Math.cos(a), y: opts.y - r + r * Math.sin(a) });
  }
  children.push({
    id: `${id}-out`,
    type: "polyline",
    x: 0,
    y: 0,
    points: [{ x: cx - r, y: top }, { x: cx - r, y: opts.y - r }, ...bottom, { x: cx + r, y: opts.y - r }, { x: cx + r, y: top }],
    stroke: color,
    strokeWidth: 2.5,
    lineJoin: "round",
  });
  return { id, type: "group", x: 0, y: 0, children };
}

/** A graduated cylinder: a tall tube on a base, with graduation ticks. */
export function graduatedCylinder(opts: GlasswareOptions): GroupNode {
  const id = opts.id ?? "cyl";
  const w = opts.width ?? 44;
  const h = opts.height ?? 150;
  const color = opts.color ?? GLASS;
  const cx = opts.x;
  const top = opts.y - h;
  const r = w / 2;
  const baseW = w * 1.5;
  const lvl = clampLevel(opts.liquid);
  const children: Node[] = [];
  if (lvl > 0) {
    const lh = lvl * (h - 10);
    children.push({
      id: `${id}-liq`,
      type: "rect",
      x: cx - r + 2,
      y: opts.y - 6 - lh,
      width: w - 4,
      height: lh,
      fill: opts.liquidColor ?? LIQUID,
      opacity: 0.85,
    });
  }
  children.push({
    id: `${id}-out`,
    type: "polyline",
    x: 0,
    y: 0,
    points: [
      { x: cx - r, y: top },
      { x: cx - r, y: opts.y - 6 },
      { x: cx - baseW / 2, y: opts.y },
      { x: cx + baseW / 2, y: opts.y },
      { x: cx + r, y: opts.y - 6 },
      { x: cx + r, y: top },
    ],
    stroke: color,
    strokeWidth: 2.5,
    lineJoin: "round",
  });
  for (let k = 1; k <= 5; k++) {
    const ty = top + ((h - 12) * k) / 6;
    children.push({
      id: `${id}-t${k}`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cx - r, y: ty },
        { x: cx - r + (k % 2 === 0 ? 12 : 7), y: ty },
      ],
      stroke: color,
      strokeWidth: 1.5,
    });
  }
  return { id, type: "group", x: 0, y: 0, children };
}

/** A funnel: a cone narrowing to a stem. */
export function funnel(opts: GlasswareOptions): GroupNode {
  const id = opts.id ?? "funnel";
  const w = opts.width ?? 80;
  const h = opts.height ?? 90;
  const color = opts.color ?? GLASS;
  const cx = opts.x;
  const top = opts.y - h;
  const stemW = w * 0.16;
  const stemH = h * 0.4;
  return {
    id,
    type: "group",
    x: 0,
    y: 0,
    children: [
      {
        id: `${id}-out`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: cx - w / 2, y: top },
          { x: cx - stemW / 2, y: opts.y - stemH },
          { x: cx - stemW / 2, y: opts.y },
          { x: cx + stemW / 2, y: opts.y },
          { x: cx + stemW / 2, y: opts.y - stemH },
          { x: cx + w / 2, y: top },
        ],
        stroke: color,
        strokeWidth: 2.5,
        lineJoin: "round",
      },
    ],
  };
}

export interface BunsenBurnerOptions {
  id?: string;
  x: number;
  y: number;
  height?: number;
  /** Show a flame above the barrel. Default true. */
  flame?: boolean;
}

/** A Bunsen burner: a base, a barrel, and an optional flame. */
export function bunsenBurner(opts: BunsenBurnerOptions): GroupNode {
  const id = opts.id ?? "burner";
  const h = opts.height ?? 90;
  const cx = opts.x;
  const color = GLASS;
  const baseW = 50;
  const barrelW = 14;
  const barrelTop = opts.y - h;
  const children: Node[] = [
    {
      id: `${id}-base`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cx - baseW / 2, y: opts.y },
        { x: cx - baseW / 6, y: opts.y - 12 },
        { x: cx - barrelW / 2, y: opts.y - 14 },
        { x: cx - barrelW / 2, y: barrelTop },
        { x: cx + barrelW / 2, y: barrelTop },
        { x: cx + barrelW / 2, y: opts.y - 14 },
        { x: cx + baseW / 6, y: opts.y - 12 },
        { x: cx + baseW / 2, y: opts.y },
      ],
      closed: true,
      stroke: color,
      strokeWidth: 2.5,
      fill: "#cbd5e1",
      lineJoin: "round",
    },
  ];
  if (opts.flame !== false) {
    const ft = barrelTop;
    const fh = 46;
    children.push({
      id: `${id}-flame-o`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cx - barrelW / 2, y: ft },
        { x: cx - 10, y: ft - fh * 0.5 },
        { x: cx, y: ft - fh },
        { x: cx + 10, y: ft - fh * 0.5 },
        { x: cx + barrelW / 2, y: ft },
      ],
      closed: true,
      fill: "#f97316",
      opacity: 0.85,
    });
    children.push({
      id: `${id}-flame-i`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cx - barrelW / 3, y: ft },
        { x: cx, y: ft - fh * 0.6 },
        { x: cx + barrelW / 3, y: ft },
      ],
      closed: true,
      fill: "#3b82f6",
      opacity: 0.9,
    });
  }
  return { id, type: "group", x: 0, y: 0, children };
}
