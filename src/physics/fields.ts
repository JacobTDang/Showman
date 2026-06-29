/**
 * Fields — a vector-field arrow grid (the cross-cutting primitive behind electric/magnetic/gravity/
 * fluid fields), point charges with a radial-gradient glow (no blur → golden-safe), and the EM
 * spectrum bar. Pure + deterministic.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";
import { connector } from "../diagram/connector.js";
import { getTheme } from "../theme/themes.js";
import { mix, withAlpha } from "../engine/color.js";

export interface VectorFieldOptions {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cols?: number;
  rows?: number;
  /** Field at a normalized position (nx, ny) ∈ [0,1]² with ny=0 at the BOTTOM. Returns a vector. */
  field: (nx: number, ny: number) => { vx: number; vy: number };
  /** Draw unit-length arrows (direction only) rather than scaling by magnitude. Default false. */
  normalize?: boolean;
  /** Color arrows low→high magnitude (blue→red). Default false (single color). */
  colorByMagnitude?: boolean;
  color?: Color;
  theme?: string;
}

/** A grid of arrows sampling a vector field — electric/magnetic/gravity/velocity fields. */
export function vectorField(opts: VectorFieldOptions): GroupNode {
  const id = opts.id ?? "field";
  const theme = getTheme(opts.theme);
  const cols = Math.max(2, opts.cols ?? 8);
  const rows = Math.max(2, opts.rows ?? 6);
  const cellW = opts.width / cols;
  const cellH = opts.height / rows;
  const maxLen = Math.min(cellW, cellH) * 0.45;

  // First pass: sample + find the max magnitude (for scaling + color).
  const samples: { cx: number; cy: number; vx: number; vy: number; mag: number }[] = [];
  let maxMag = 1e-9;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const nx = cols > 1 ? i / (cols - 1) : 0.5;
      const ny = rows > 1 ? 1 - j / (rows - 1) : 0.5;
      const v = opts.field(nx, ny);
      const vx = Number.isFinite(v?.vx) ? v.vx : 0;
      const vy = Number.isFinite(v?.vy) ? v.vy : 0;
      const mag = Math.hypot(vx, vy);
      maxMag = Math.max(maxMag, mag);
      samples.push({ cx: opts.x + (i + 0.5) * cellW, cy: opts.y + (j + 0.5) * cellH, vx, vy, mag });
    }
  }

  const lo = theme.palette.secondary;
  const hi = theme.palette.accent;
  const children: Node[] = [];
  samples.forEach((s, k) => {
    if (s.mag < 1e-9) return; // no arrow at a null point
    const ux = s.vx / s.mag;
    const uy = -s.vy / s.mag; // screen y is down
    const len = opts.normalize ? maxLen : Math.min(maxLen, (s.mag / maxMag) * maxLen + maxLen * 0.15);
    const half = len / 2;
    const stroke = opts.colorByMagnitude ? mix(lo, hi, s.mag / maxMag) : (opts.color ?? theme.palette.primary);
    children.push(
      connector({
        id: `${id}-a${k}`,
        from: { x: s.cx - ux * half, y: s.cy - uy * half },
        to: { x: s.cx + ux * half, y: s.cy + uy * half },
        stroke,
        strokeWidth: 2,
        arrowSize: 7,
      }),
    );
  });
  return { id, type: "group", x: 0, y: 0, children };
}

export interface PointChargeOptions {
  id?: string;
  x: number;
  y: number;
  /** Sign + relative magnitude: positive = red (+), negative = blue (−). */
  charge: number;
  radius?: number;
  /** Radial field arrows (out for +, in for −). Default false. */
  fieldArrows?: boolean;
  arrowCount?: number;
  arrowLength?: number;
}

/** A point charge: a glowing disc (radial gradient, no blur) with a sign label + optional field arrows. */
export function pointCharge(opts: PointChargeOptions): GroupNode {
  const id = opts.id ?? "charge";
  const pos = opts.charge >= 0;
  const core = pos ? "#dc2626" : "#2563eb";
  const r = opts.radius ?? 18;
  const glowR = r * 2.4;
  const children: Node[] = [
    // Soft glow from a radial gradient (deterministic, unlike shadow blur).
    {
      id: `${id}-glow`,
      type: "ellipse",
      x: opts.x - glowR,
      y: opts.y - glowR,
      width: glowR * 2,
      height: glowR * 2,
      fill: "transparent",
      gradient: {
        type: "radial",
        center: { x: glowR, y: glowR },
        radius: glowR,
        stops: [
          { offset: 0, color: withAlpha(core, 0.35) },
          { offset: 1, color: withAlpha(core, 0) },
        ],
      },
    },
    {
      id: `${id}-core`,
      type: "ellipse",
      x: opts.x - r,
      y: opts.y - r,
      width: r * 2,
      height: r * 2,
      fill: core,
      stroke: "#ffffff",
      strokeWidth: 2,
    },
    {
      id: `${id}-sign`,
      type: "text",
      x: opts.x,
      y: opts.y,
      text: pos ? "+" : "−",
      fontFamily: "Inter",
      fontWeight: 800,
      fontSize: Math.round(r * 1.2),
      fill: "#ffffff",
      align: "center",
      baseline: "middle",
    },
  ];
  if (opts.fieldArrows) {
    const n = opts.arrowCount ?? 8;
    const len = opts.arrowLength ?? r * 2.2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const inner = { x: opts.x + ux * (r + 4), y: opts.y + uy * (r + 4) };
      const outer = { x: opts.x + ux * (r + 4 + len), y: opts.y + uy * (r + 4 + len) };
      children.push(
        connector({
          id: `${id}-f${i}`,
          from: pos ? inner : outer,
          to: pos ? outer : inner,
          stroke: withAlpha(core, 0.7),
          strokeWidth: 2,
          arrowSize: 8,
        }),
      );
    }
  }
  return { id, type: "group", x: 0, y: 0, children };
}

export interface EmSpectrumOptions {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Show the band labels (Radio…Gamma). Default true. */
  labels?: boolean;
  theme?: string;
}

const EM_BANDS: { name: string; color: Color; span: number }[] = [
  { name: "Radio", color: "#64748b", span: 1.4 },
  { name: "Micro", color: "#0ea5e9", span: 1 },
  { name: "IR", color: "#dc2626", span: 1 },
  { name: "Visible", color: "rainbow", span: 0.8 },
  { name: "UV", color: "#7c3aed", span: 1 },
  { name: "X-ray", color: "#1e293b", span: 1 },
  { name: "Gamma", color: "#0f172a", span: 1.2 },
];
const RAINBOW = ["#e11d48", "#f97316", "#eab308", "#16a34a", "#0ea5e9", "#6366f1", "#7c3aed"];

/** The electromagnetic spectrum as labeled bands, with the visible window shown as a rainbow. */
export function emSpectrum(opts: EmSpectrumOptions): GroupNode {
  const id = opts.id ?? "em";
  const theme = getTheme(opts.theme);
  const w = opts.width ?? 560;
  const barH = opts.height ?? 34;
  const total = EM_BANDS.reduce((s, b) => s + b.span, 0);
  const children: Node[] = [];
  let cx = opts.x;
  EM_BANDS.forEach((b, i) => {
    const bw = (b.span / total) * w;
    if (b.color === "rainbow") {
      children.push({
        id: `${id}-b${i}`,
        type: "rect",
        x: cx,
        y: opts.y,
        width: bw,
        height: barH,
        gradient: {
          type: "linear",
          from: { x: 0, y: 0 },
          to: { x: bw, y: 0 },
          stops: RAINBOW.map((c, k) => ({ offset: k / (RAINBOW.length - 1), color: c })),
        },
      });
    } else {
      children.push({ id: `${id}-b${i}`, type: "rect", x: cx, y: opts.y, width: bw, height: barH, fill: b.color });
    }
    if (opts.labels !== false) {
      children.push({
        id: `${id}-l${i}`,
        type: "text",
        x: cx + bw / 2,
        y: opts.y + barH + 13,
        text: b.name,
        fontFamily: theme.bodyFont,
        fontWeight: b.name === "Visible" ? 700 : 500,
        fontSize: 12,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
      });
    }
    cx += bw;
  });
  // Wavelength direction hint.
  if (opts.labels !== false) {
    children.push({
      id: `${id}-lo`,
      type: "text",
      x: opts.x,
      y: opts.y - 12,
      text: "longer wavelength",
      fontFamily: theme.bodyFont,
      fontWeight: 500,
      fontSize: 11,
      fill: theme.palette.muted,
      align: "left",
      baseline: "middle",
    });
    children.push({
      id: `${id}-hi`,
      type: "text",
      x: opts.x + w,
      y: opts.y - 12,
      text: "shorter wavelength",
      fontFamily: theme.bodyFont,
      fontWeight: 500,
      fontSize: 11,
      fill: theme.palette.muted,
      align: "right",
      baseline: "middle",
    });
  }
  return { id, type: "group", x: 0, y: 0, children };
}
