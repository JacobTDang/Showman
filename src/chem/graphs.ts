/**
 * Chemistry graphs — a reaction-coordinate (energy) diagram and a pH scale. Pure builders over the
 * math coordinate-plane + primitives, so they're deterministic + golden-safe. The energy diagram is
 * the highest-coverage chemistry visual per unit effort (activation energy, exo/endothermic, ΔH,
 * catalysts); the pH scale anchors every acid/base lesson.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import { coordinatePlane, plotFunction } from "../math/index.js";
import { getTheme } from "../theme/themes.js";
import { connector } from "../diagram/connector.js";

export interface EnergyDiagramOptions {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Energies (arbitrary units, ≥ 0). The transition-state peak should exceed both levels. */
  reactantsLevel: number;
  productsLevel: number;
  activationPeak: number;
  /** A lower transition state with a catalyst (dashed). Optional. */
  catalystPeak?: number;
  labels?: { reactants?: string; products?: string };
  theme?: string;
  /** Draw the curve on. Default false. */
  animate?: boolean;
}

/** A smooth plateau → bump → plateau reaction-coordinate curve over x ∈ [0, 1]. */
function energyCurve(rLevel: number, pLevel: number, peak: number): (x: number) => number {
  const smooth = (t: number): number => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * c * (c * (c * 6 - 15) + 10); // smootherstep
  };
  return (x: number) => {
    const base = rLevel + (pLevel - rLevel) * smooth((x - 0.28) / 0.44);
    const mid = rLevel + (pLevel - rLevel) * smooth((0.5 - 0.28) / 0.44);
    const bump = (peak - mid) * Math.exp(-(((x - 0.5) / 0.13) ** 2));
    return base + bump;
  };
}

export function energyDiagram(opts: EnergyDiagramOptions): GroupNode {
  const id = opts.id ?? "energy";
  const theme = getTheme(opts.theme);
  const w = opts.width ?? 460;
  const h = opts.height ?? 320;
  const topE = Math.max(opts.activationPeak, opts.reactantsLevel, opts.productsLevel) * 1.18 || 1;
  const plane = coordinatePlane({
    id: `${id}-pl`,
    x: opts.x,
    y: opts.y,
    width: w,
    height: h,
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: topE,
    step: topE,
    showGrid: false,
    showLabels: false,
  });
  const children: Node[] = [plane.node];

  const curve = plotFunction(
    plane,
    energyCurve(opts.reactantsLevel, opts.productsLevel, opts.activationPeak),
    { samples: 96 },
    { id: `${id}-curve`, stroke: theme.palette.primary, strokeWidth: 4 },
  );
  if (opts.animate) {
    curve.progress = 0;
    curve.tracks = [
      {
        property: "progress",
        keyframes: [
          { t: 0.2, value: 0 },
          { t: 1.6, value: 1, easing: "easeInOutSine" },
        ],
      },
    ] as Track[];
  }
  if (opts.catalystPeak !== undefined) {
    const cat = plotFunction(
      plane,
      energyCurve(opts.reactantsLevel, opts.productsLevel, opts.catalystPeak),
      { samples: 96 },
      { id: `${id}-cat`, stroke: theme.palette.accent, strokeWidth: 2.5 },
    );
    cat.dash = [7, 5];
    children.push(cat);
  }
  children.push(curve);

  // Axis captions.
  children.push({
    id: `${id}-yax`,
    type: "text",
    x: opts.x - 8,
    y: opts.y + h / 2,
    text: "Energy",
    fontFamily: theme.bodyFont,
    fontWeight: 600,
    fontSize: 14,
    fill: theme.palette.muted,
    align: "center",
    baseline: "middle",
    rotation: -90,
    anchor: { x: 0, y: 0 },
  });
  children.push({
    id: `${id}-xax`,
    type: "text",
    x: opts.x + w / 2,
    y: opts.y + h + 18,
    text: "Reaction progress",
    fontFamily: theme.bodyFont,
    fontWeight: 600,
    fontSize: 14,
    fill: theme.palette.muted,
    align: "center",
    baseline: "middle",
  });

  // Eₐ marker: a dashed double-arrow from the reactants level up to the peak at x≈0.5.
  const at = (dx: number, dy: number): { x: number; y: number } => {
    const l = plane.toLocal(dx, dy);
    return { x: opts.x + l.x, y: opts.y + l.y };
  };
  const eaFrom = at(0.5, opts.reactantsLevel);
  const eaTo = at(0.5, opts.activationPeak);
  children.push(
    connector({
      id: `${id}-ea`,
      from: eaFrom,
      to: eaTo,
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
      dash: [5, 4],
      startArrow: "arrow",
      endArrow: "arrow",
      arrowSize: 8,
    }),
  );
  children.push({
    id: `${id}-ea-lbl`,
    type: "text",
    x: eaFrom.x + 10,
    y: (eaFrom.y + eaTo.y) / 2,
    text: "Ea",
    fontFamily: theme.bodyFont,
    fontWeight: 700,
    fontSize: 15,
    fill: theme.palette.text,
    align: "left",
    baseline: "middle",
  });

  // ΔH marker: from reactants to products level near the right.
  const dhFrom = at(0.82, opts.reactantsLevel);
  const dhTo = at(0.82, opts.productsLevel);
  children.push(
    connector({
      id: `${id}-dh`,
      from: dhFrom,
      to: dhTo,
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
      dash: [5, 4],
      startArrow: "arrow",
      endArrow: "arrow",
      arrowSize: 8,
    }),
  );
  children.push({
    id: `${id}-dh-lbl`,
    type: "text",
    x: dhFrom.x + 10,
    y: (dhFrom.y + dhTo.y) / 2,
    text: "ΔH",
    fontFamily: theme.bodyFont,
    fontWeight: 700,
    fontSize: 15,
    fill: theme.palette.text,
    align: "left",
    baseline: "middle",
  });

  // Level labels.
  const rLbl = opts.labels?.reactants;
  if (rLbl !== undefined && rLbl.trim() !== "")
    children.push({
      id: `${id}-r-lbl`,
      type: "text",
      x: at(0.04, opts.reactantsLevel).x,
      y: at(0.04, opts.reactantsLevel).y - 14,
      text: rLbl,
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 14,
      fill: theme.palette.text,
      align: "left",
      baseline: "middle",
    });
  const pLbl = opts.labels?.products;
  if (pLbl !== undefined && pLbl.trim() !== "")
    children.push({
      id: `${id}-p-lbl`,
      type: "text",
      x: at(0.96, opts.productsLevel).x,
      y: at(0.96, opts.productsLevel).y - 14,
      text: pLbl,
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 14,
      fill: theme.palette.text,
      align: "right",
      baseline: "middle",
    });

  return { id, type: "group", x: 0, y: 0, children };
}

export interface PhScaleOptions {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** pH 0–14 to mark with a pointer. Optional. */
  value?: number;
  label?: string;
  theme?: string;
}

const PH_STOPS: { offset: number; color: Color }[] = [
  { offset: 0, color: "#e11d48" },
  { offset: 0.21, color: "#f97316" },
  { offset: 0.36, color: "#eab308" },
  { offset: 0.5, color: "#16a34a" },
  { offset: 0.64, color: "#0ea5e9" },
  { offset: 0.86, color: "#6366f1" },
  { offset: 1, color: "#7c3aed" },
];

/** A pH 0–14 scale: a red→green→purple gradient bar with ticks and an optional pointer at `value`. */
export function phScale(opts: PhScaleOptions): GroupNode {
  const id = opts.id ?? "ph";
  const theme = getTheme(opts.theme);
  const x = opts.x;
  const y = opts.y;
  const w = opts.width ?? 420;
  const barH = opts.height ?? 26;
  const children: Node[] = [
    {
      id: `${id}-bar`,
      type: "rect",
      x,
      y,
      width: w,
      height: barH,
      radius: 6,
      gradient: { type: "linear", from: { x: 0, y: 0 }, to: { x: w, y: 0 }, stops: PH_STOPS },
    },
  ];
  for (let ph = 0; ph <= 14; ph++) {
    const tx = x + (ph / 14) * w;
    children.push({
      id: `${id}-t${ph}`,
      type: "text",
      x: tx,
      y: y + barH + 12,
      text: String(ph),
      fontFamily: theme.bodyFont,
      fontWeight: ph === 7 ? 700 : 500,
      fontSize: 12,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
    });
  }
  if (opts.value !== undefined && Number.isFinite(opts.value)) {
    const v = Math.min(14, Math.max(0, opts.value));
    const px = x + (v / 14) * w;
    children.push({
      id: `${id}-ptr`,
      type: "polyline",
      x: px,
      y: y - 12,
      points: [
        { x: -7, y: -10 },
        { x: 7, y: -10 },
        { x: 0, y: 0 },
      ],
      closed: true,
      fill: theme.palette.text,
      stroke: theme.palette.text,
      strokeWidth: 1,
    });
    if (opts.label !== undefined && opts.label.trim() !== "") {
      children.push({
        id: `${id}-ptr-lbl`,
        type: "text",
        x: px,
        y: y - 30,
        text: opts.label,
        fontFamily: theme.bodyFont,
        fontWeight: 700,
        fontSize: 14,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
      });
    }
  }
  return { id, type: "group", x: 0, y: 0, children };
}
