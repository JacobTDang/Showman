/**
 * Fraction on a number line — a horizontal line from 0 to `whole` divided into
 * `denominator` equal ticks, with the segment from 0 to `numerator/denominator`
 * drawn as a thick colored overlay and a marker dot placed at that fraction.
 * Composes engine primitives the same way the other math builders do: themed via
 * `getTheme`, id-namespaced via `idGen`, returning a `GroupNode` placed at (x, y)
 * with children in local coords. Pure function of its options.
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme, idGen, fmtTick, clamp, finiteNum, posSize, intCount } from "./shared.js";

// ───────────────────────── Fraction on a number line ─────────────────────────

export interface NumberLineFractionOptions {
  id?: string;
  /** Top-left placement of the builder (the baseline sits at local y = 0). */
  x?: number;
  y?: number;
  /** Pixel length of the line. Default 360. */
  width?: number;
  /** The value at the right end of the line. Default 1. */
  whole?: number;
  /** The fraction's numerator (clamped to 0..denominator). */
  numerator: number;
  /** The fraction's denominator — the line is split into this many equal parts. */
  denominator: number;
  theme?: string;
}

/**
 * A fraction on a number line: base line 0..`whole`, split into `denominator`
 * equal ticks, with the 0 → `numerator/denominator` segment highlighted and a
 * marker dot at the fraction.
 */
export function buildNumberLineFraction(opts: NumberLineFractionOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "nlfrac";
  const nid = idGen(prefix);
  const w = posSize(opts.width, 360);
  const whole = posSize(opts.whole, 1);
  // intCount keeps the tick loop bounded and the denominator a finite integer; the
  // Math.max(1, …) guarantees a non-zero divisor (denominator:0 → 1, no /0).
  const denom = Math.max(1, intCount(opts.denominator, 1));
  const num = clamp(Math.floor(finiteNum(opts.numerator, 0)), 0, denom);
  // Fraction of the line covered (0..1) and its pixel x.
  const frac = num / denom;
  const markerX = clamp(frac, 0, 1) * w;

  const lineColor = theme.palette.text;
  const tickColor = theme.palette.muted;
  const highlightColor = theme.palette.primary;
  const markerColor = theme.palette.secondary;
  const r = 9;

  const children: Node[] = [];

  // Base line (0 → whole).
  children.push({
    id: nid(),
    type: "polyline",
    points: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
    ],
    stroke: lineColor,
    strokeWidth: 3,
    lineCap: "round",
  });

  // Equal-part tick marks at each i/denom of the line.
  for (let i = 0; i <= denom; i++) {
    const tx = (i / denom) * w;
    children.push({
      id: nid(),
      type: "polyline",
      points: [
        { x: tx, y: -8 },
        { x: tx, y: 8 },
      ],
      stroke: tickColor,
      strokeWidth: 2,
    });
  }

  // Highlighted segment 0 → numerator/denominator (thick overlay on the base line).
  children.push({
    id: nid(),
    type: "polyline",
    points: [
      { x: 0, y: 0 },
      { x: markerX, y: 0 },
    ],
    stroke: highlightColor,
    strokeWidth: 9,
    lineCap: "round",
  });

  // Marker dot at the fraction.
  children.push({
    id: nid(),
    type: "ellipse",
    x: markerX - r,
    y: -r,
    width: r * 2,
    height: r * 2,
    fill: markerColor,
  });

  // Fraction label above the marker.
  children.push({
    id: nid(),
    type: "text",
    x: markerX,
    y: -22,
    text: `${num}/${denom}`,
    fontSize: 18,
    fontFamily: theme.bodyFont,
    fontWeight: 700,
    fill: highlightColor,
    align: "center",
    baseline: "bottom",
  });

  // End labels: 0 at the start, the whole value at the right end.
  children.push({
    id: nid(),
    type: "text",
    x: 0,
    y: 22,
    text: "0",
    fontSize: 16,
    fontFamily: theme.bodyFont,
    fontWeight: 600,
    fill: tickColor,
    align: "center",
    baseline: "middle",
  });
  children.push({
    id: nid(),
    type: "text",
    x: w,
    y: 22,
    text: fmtTick(whole),
    fontSize: 16,
    fontFamily: theme.bodyFont,
    fontWeight: 600,
    fill: tickColor,
    align: "center",
    baseline: "middle",
  });

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
