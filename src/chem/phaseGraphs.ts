/**
 * Chemistry process graphs — a titration curve (pH vs titrant), a heating curve (temperature vs heat,
 * with phase-change plateaus), and a phase diagram (P–T regions). Pure builders over the math
 * coordinate-plane; deterministic + golden-safe.
 */

import type { Node, GroupNode, Track } from "../spec/types.js";
import { coordinatePlane, plotFunction } from "../math/index.js";
import { getTheme } from "../theme/themes.js";

export interface TitrationCurveOptions {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Titrant volume (mL) of the equivalence point. */
  equivalenceVolume?: number;
  maxVolume?: number;
  startPh?: number;
  endPh?: number;
  steepness?: number;
  theme?: string;
  animate?: boolean;
}

/** A titration curve: pH rising through a sharp jump at the equivalence point (a logistic). */
export function titrationCurve(opts: TitrationCurveOptions): GroupNode {
  const id = opts.id ?? "titr";
  const theme = getTheme(opts.theme);
  const w = opts.width ?? 420;
  const h = opts.height ?? 300;
  const vMax = opts.maxVolume ?? 50;
  const vEq = opts.equivalenceVolume ?? vMax / 2;
  const p0 = opts.startPh ?? 1;
  const p1 = opts.endPh ?? 13;
  const k = opts.steepness ?? 0.8;
  const plane = coordinatePlane({
    id: `${id}-pl`,
    x: opts.x,
    y: opts.y,
    width: w,
    height: h,
    xMin: 0,
    xMax: vMax,
    yMin: 0,
    yMax: 14,
    step: vMax / 5,
    showLabels: true,
  });
  const curve = plotFunction(
    plane,
    (v) => p0 + (p1 - p0) / (1 + Math.exp(-k * (v - vEq))),
    { samples: 120 },
    { id: `${id}-curve`, stroke: theme.palette.primary, strokeWidth: 4 },
  );
  if (opts.animate) {
    curve.progress = 0;
    curve.tracks = [
      {
        property: "progress",
        keyframes: [
          { t: 0.2, value: 0 },
          { t: 1.8, value: 1, easing: "easeInOutSine" },
        ],
      },
    ] as Track[];
  }
  const eq = plane.toLocal(vEq, 7);
  const children: Node[] = [
    plane.node,
    curve,
    {
      id: `${id}-eq`,
      type: "ellipse",
      x: opts.x + eq.x - 5,
      y: opts.y + eq.y - 5,
      width: 10,
      height: 10,
      fill: theme.palette.accent,
      stroke: "#ffffff",
      strokeWidth: 1.5,
    },
    {
      id: `${id}-eq-lbl`,
      type: "text",
      x: opts.x + eq.x + 12,
      y: opts.y + eq.y,
      text: "equivalence",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.text,
      align: "left",
      baseline: "middle",
    },
    {
      id: `${id}-xax`,
      type: "text",
      x: opts.x + w / 2,
      y: opts.y + h + 22,
      text: "Titrant added (mL)",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
    },
    {
      id: `${id}-yax`,
      type: "text",
      x: opts.x - 30,
      y: opts.y + h / 2,
      text: "pH",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
      rotation: -90,
      anchor: { x: 0, y: 0 },
    },
  ];
  return { id, type: "group", x: 0, y: 0, children };
}

export interface HeatingCurveOptions {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  meltTemp?: number;
  boilTemp?: number;
  startTemp?: number;
  endTemp?: number;
  theme?: string;
  animate?: boolean;
}

/** A heating curve: temperature vs heat added, flat at the melting + boiling phase changes. */
export function heatingCurve(opts: HeatingCurveOptions): GroupNode {
  const id = opts.id ?? "heat";
  const theme = getTheme(opts.theme);
  const w = opts.width ?? 420;
  const h = opts.height ?? 300;
  const melt = opts.meltTemp ?? 0;
  const boil = opts.boilTemp ?? 100;
  const t0 = opts.startTemp ?? -20;
  const t1 = opts.endTemp ?? 120;
  const plane = coordinatePlane({
    id: `${id}-pl`,
    x: opts.x,
    y: opts.y,
    width: w,
    height: h,
    xMin: 0,
    xMax: 1,
    yMin: t0,
    yMax: t1,
    step: (t1 - t0) / 6,
    showGrid: true,
    showLabels: false,
  });
  // Corner points (heat fraction, temperature): solid rise, melt plateau, liquid rise, boil plateau, gas rise.
  const corners: [number, number][] = [
    [0, t0],
    [0.12, melt],
    [0.32, melt],
    [0.5, boil],
    [0.78, boil],
    [1, t1],
  ];
  const pts = corners.map(([hx, ty]) => plane.toLocal(hx, ty));
  const curve: Node = {
    id: `${id}-curve`,
    type: "polyline",
    x: plane.originX,
    y: plane.originY,
    points: pts,
    stroke: theme.palette.primary,
    strokeWidth: 4,
    lineJoin: "round",
  };
  if (opts.animate) {
    curve.progress = 0;
    curve.tracks = [
      {
        property: "progress",
        keyframes: [
          { t: 0.2, value: 0 },
          { t: 1.8, value: 1, easing: "easeInOutSine" },
        ],
      },
    ] as Track[];
  }
  const mid = (i: number, j: number) => ({ x: opts.x + (pts[i]!.x + pts[j]!.x) / 2, y: opts.y + (pts[i]!.y + pts[j]!.y) / 2 });
  const m = mid(1, 2);
  const b = mid(3, 4);
  const children: Node[] = [
    plane.node,
    curve,
    {
      id: `${id}-melt`,
      type: "text",
      x: m.x,
      y: m.y - 12,
      text: "melting",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 12,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
    },
    {
      id: `${id}-boil`,
      type: "text",
      x: b.x,
      y: b.y - 12,
      text: "boiling",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 12,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
    },
    {
      id: `${id}-xax`,
      type: "text",
      x: opts.x + w / 2,
      y: opts.y + h + 18,
      text: "Heat added",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
    },
    {
      id: `${id}-yax`,
      type: "text",
      x: opts.x - 14,
      y: opts.y + h / 2,
      text: "Temperature",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
      rotation: -90,
      anchor: { x: 0, y: 0 },
    },
  ];
  return { id, type: "group", x: 0, y: 0, children };
}

export interface PhaseDiagramOptions {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  theme?: string;
}

/** A pressure–temperature phase diagram: solid/liquid/gas regions, triple point, and critical point. */
export function phaseDiagram(opts: PhaseDiagramOptions): GroupNode {
  const id = opts.id ?? "phase";
  const theme = getTheme(opts.theme);
  const w = opts.width ?? 400;
  const h = opts.height ?? 300;
  const plane = coordinatePlane({
    id: `${id}-pl`,
    x: opts.x,
    y: opts.y,
    width: w,
    height: h,
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    step: 0.25,
    showGrid: false,
    showLabels: false,
  });
  const L = (dx: number, dy: number) => {
    const p = plane.toLocal(dx, dy);
    return { x: opts.x + p.x, y: opts.y + p.y };
  };
  const triple = { dx: 0.28, dy: 0.22 };
  const critical = { dx: 0.82, dy: 0.86 };
  const tp = L(triple.dx, triple.dy);
  const cp = L(critical.dx, critical.dy);
  const line = (idc: string, a: { x: number; y: number }, b: { x: number; y: number }): Node => ({
    id: idc,
    type: "polyline",
    x: 0,
    y: 0,
    points: [a, b],
    stroke: theme.palette.text,
    strokeWidth: 2.5,
    lineJoin: "round",
  });
  const lbl = (idc: string, dx: number, dy: number, text: string): Node => ({
    id: idc,
    type: "text",
    x: L(dx, dy).x,
    y: L(dx, dy).y,
    text,
    fontFamily: theme.bodyFont,
    fontWeight: 700,
    fontSize: 15,
    fill: theme.palette.muted,
    align: "center",
    baseline: "middle",
  });
  const children: Node[] = [
    plane.node,
    line(`${id}-sub`, L(0.02, 0.02), tp), // sublimation (solid–gas)
    line(`${id}-fus`, tp, L(0.34, 0.98)), // fusion (solid–liquid), steep
    line(`${id}-vap`, tp, cp), // vaporization (liquid–gas)
    { id: `${id}-tp`, type: "ellipse", x: tp.x - 4, y: tp.y - 4, width: 8, height: 8, fill: theme.palette.accent },
    {
      id: `${id}-tp-lbl`,
      type: "text",
      x: tp.x + 8,
      y: tp.y + 12,
      text: "triple",
      fontFamily: theme.bodyFont,
      fontWeight: 500,
      fontSize: 11,
      fill: theme.palette.text,
      align: "left",
      baseline: "middle",
    },
    { id: `${id}-cp`, type: "ellipse", x: cp.x - 4, y: cp.y - 4, width: 8, height: 8, fill: theme.palette.accent },
    {
      id: `${id}-cp-lbl`,
      type: "text",
      x: cp.x - 8,
      y: cp.y - 12,
      text: "critical",
      fontFamily: theme.bodyFont,
      fontWeight: 500,
      fontSize: 11,
      fill: theme.palette.text,
      align: "right",
      baseline: "middle",
    },
    lbl(`${id}-solid`, 0.12, 0.7, "Solid"),
    lbl(`${id}-liquid`, 0.5, 0.78, "Liquid"),
    lbl(`${id}-gas`, 0.7, 0.18, "Gas"),
    {
      id: `${id}-xax`,
      type: "text",
      x: opts.x + w / 2,
      y: opts.y + h + 16,
      text: "Temperature",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
    },
    {
      id: `${id}-yax`,
      type: "text",
      x: opts.x - 14,
      y: opts.y + h / 2,
      text: "Pressure",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
      rotation: -90,
      anchor: { x: 0, y: 0 },
    },
  ];
  return { id, type: "group", x: 0, y: 0, children };
}
