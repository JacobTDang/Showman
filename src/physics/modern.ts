/**
 * Modern + thermal physics — a Bohr atom (nucleus + electron shells, optionally orbiting), an atomic
 * energy-level diagram (with photon transitions), and a P–V diagram (work as the area under an
 * isotherm). Pure + deterministic + golden-safe.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import { coordinatePlane, plotFunction } from "../math/index.js";
import { getTheme } from "../theme/themes.js";
import { connector } from "../diagram/connector.js";

export interface BohrAtomOptions {
  id?: string;
  x: number;
  y: number;
  /** Electrons per shell, innermost first (e.g. [2, 8, 1] for sodium). */
  shells: number[];
  symbol?: string;
  nucleusRadius?: number;
  shellGap?: number;
  electronColor?: Color;
  /** Orbit the electrons. Default false. */
  animate?: boolean;
  theme?: string;
}

/** A Bohr model: a labelled nucleus with concentric electron shells (optionally orbiting). */
export function bohrAtom(opts: BohrAtomOptions): GroupNode {
  const id = opts.id ?? "bohr";
  const theme = getTheme(opts.theme);
  const nr = opts.nucleusRadius ?? 22;
  const gap = opts.shellGap ?? 26;
  const eColor = opts.electronColor ?? "#2563eb";
  const children: Node[] = [];

  opts.shells.forEach((count, i) => {
    const r = nr + (i + 1) * gap;
    children.push({
      id: `${id}-shell${i}`,
      type: "ellipse",
      x: opts.x - r,
      y: opts.y - r,
      width: r * 2,
      height: r * 2,
      fill: "transparent",
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
    });
    const electrons: Node[] = [];
    for (let e = 0; e < count; e++) {
      const a = (e / count) * Math.PI * 2 - Math.PI / 2;
      electrons.push({
        id: `${id}-e${i}-${e}`,
        type: "ellipse",
        x: Math.cos(a) * r - 5,
        y: Math.sin(a) * r - 5,
        width: 10,
        height: 10,
        fill: eColor,
      });
    }
    // Each shell is a group centred on the nucleus so it can rotate (orbit) as a unit.
    const ring: GroupNode = { id: `${id}-ring${i}`, type: "group", x: opts.x, y: opts.y, anchor: { x: 0, y: 0 }, children: electrons };
    if (opts.animate) {
      const period = 3 + i * 1.5;
      ring.tracks = [
        {
          property: "rotation",
          keyframes: [
            { t: 0, value: 0 },
            { t: period, value: 360 },
          ],
        },
      ] as Track[];
    }
    children.push(ring);
  });

  // Nucleus last, on top.
  children.push({
    id: `${id}-nuc`,
    type: "ellipse",
    x: opts.x - nr,
    y: opts.y - nr,
    width: nr * 2,
    height: nr * 2,
    fill: "#ef4444",
    stroke: "#991b1b",
    strokeWidth: 2,
  });
  if (opts.symbol !== undefined && opts.symbol.trim() !== "") {
    children.push({
      id: `${id}-sym`,
      type: "text",
      x: opts.x,
      y: opts.y,
      text: opts.symbol,
      fontFamily: "Inter",
      fontWeight: 800,
      fontSize: Math.round(nr * 0.9),
      fill: "#ffffff",
      align: "center",
      baseline: "middle",
    });
  }
  return { id, type: "group", x: 0, y: 0, children };
}

export interface EnergyLevelsOptions {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Number of levels (hydrogen-like Eₙ = −1/n²). Default 4. */
  levels?: number;
  /** A transition between two levels (from → to). from > to = emission (a photon out). */
  transition?: { from: number; to: number };
  theme?: string;
}

/** An atomic energy-level diagram: converging Eₙ = −1/n² levels with an optional photon transition. */
export function energyLevels(opts: EnergyLevelsOptions): GroupNode {
  const id = opts.id ?? "levels";
  const theme = getTheme(opts.theme);
  const w = opts.width ?? 300;
  const h = opts.height ?? 280;
  const n = Math.max(2, opts.levels ?? 4);
  // y for level k: fraction up = 1 − 1/k² (n=1 at the bottom, converging toward 0 at the top).
  const yOf = (k: number): number => opts.y + h - (1 - 1 / (k * k)) * h;
  const children: Node[] = [];
  for (let k = 1; k <= n; k++) {
    const ly = yOf(k);
    children.push({
      id: `${id}-L${k}`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: opts.x, y: ly },
        { x: opts.x + w, y: ly },
      ],
      stroke: theme.palette.text,
      strokeWidth: 2,
    });
    children.push({
      id: `${id}-n${k}`,
      type: "text",
      x: opts.x + w + 12,
      y: ly,
      text: `n=${k}`,
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.muted,
      align: "left",
      baseline: "middle",
    });
  }
  if (opts.transition) {
    const from = Math.max(1, Math.min(n, opts.transition.from));
    const to = Math.max(1, Math.min(n, opts.transition.to));
    const emission = from > to;
    const tx = opts.x + w * 0.5;
    children.push(
      connector({
        id: `${id}-trans`,
        from: { x: tx, y: yOf(from) },
        to: { x: tx, y: yOf(to) },
        stroke: emission ? "#f59e0b" : "#2563eb",
        strokeWidth: 2.5,
        arrowSize: 9,
      }),
    );
    children.push({
      id: `${id}-photon`,
      type: "text",
      x: tx + 12,
      y: (yOf(from) + yOf(to)) / 2,
      text: emission ? "photon out" : "photon in",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 12,
      fill: theme.palette.text,
      align: "left",
      baseline: "middle",
    });
  }
  return { id, type: "group", x: 0, y: 0, children };
}

export interface PvDiagramOptions {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Volume range to draw the isotherm over (data units). */
  vMin?: number;
  vMax?: number;
  /** PV = constant. Default sets a curve that fills the box. */
  pvConstant?: number;
  /** Shade the work area (∫P dV) under the curve. Default true. */
  shadeWork?: boolean;
  theme?: string;
}

/** A pressure–volume diagram: an isotherm (PV = const) with the work area shaded beneath it. */
export function pvDiagram(opts: PvDiagramOptions): GroupNode {
  const id = opts.id ?? "pv";
  const theme = getTheme(opts.theme);
  const w = opts.width ?? 360;
  const h = opts.height ?? 280;
  const vMin = opts.vMin ?? 1;
  const vMax = opts.vMax ?? 6;
  const c = opts.pvConstant ?? vMin * 8; // P(vMin) ≈ 8 → fits a 0..10 P-axis
  const pMax = (c / vMin) * 1.15;
  const plane = coordinatePlane({
    id: `${id}-pl`,
    x: opts.x,
    y: opts.y,
    width: w,
    height: h,
    xMin: 0,
    xMax: vMax * 1.1,
    yMin: 0,
    yMax: pMax,
    step: pMax,
    showGrid: false,
    showLabels: false,
  });
  const children: Node[] = [plane.node];

  if (opts.shadeWork !== false) {
    const area: { x: number; y: number }[] = [plane.toLocal(vMin, 0)];
    for (let i = 0; i <= 40; i++) {
      const v = vMin + ((vMax - vMin) * i) / 40;
      area.push(plane.toLocal(v, c / v));
    }
    area.push(plane.toLocal(vMax, 0));
    children.push({
      id: `${id}-work`,
      type: "polyline",
      x: plane.originX,
      y: plane.originY,
      points: area,
      closed: true,
      fill: theme.palette.accent,
      opacity: 0.18,
    });
    children.push({
      id: `${id}-work-lbl`,
      type: "text",
      x: opts.x + plane.toLocal((vMin + vMax) / 2, 0).x,
      y: opts.y + plane.toLocal((vMin + vMax) / 2, 0).y - 28,
      text: "W = ∫P dV",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
    });
  }
  children.push(
    plotFunction(
      plane,
      (v) => (v > 0 ? c / v : pMax),
      { samples: 96, xMin: vMin, xMax: vMax },
      { id: `${id}-iso`, stroke: theme.palette.primary, strokeWidth: 4 },
    ),
  );
  children.push({
    id: `${id}-xax`,
    type: "text",
    x: opts.x + w / 2,
    y: opts.y + h + 16,
    text: "Volume",
    fontFamily: theme.bodyFont,
    fontWeight: 600,
    fontSize: 13,
    fill: theme.palette.muted,
    align: "center",
    baseline: "middle",
  });
  children.push({
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
  });
  return { id, type: "group", x: 0, y: 0, children };
}
