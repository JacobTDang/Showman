/**
 * Bar graph — a composite math builder. Composes a baseline axis (polyline) with
 * one vertical bar (rect) per datum, a value readout (counter) above each bar, and
 * a category label (text) below. Bar heights are precomputed here at build time so
 * the spec stays pure JSON.
 *
 * Like the other math builders, this returns a GroupNode placed at (x, y) with its
 * children in local coords, is themed via `getTheme`, id-namespaced via `idGen`,
 * and is a PURE function of its options (same opts -> same spec).
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme, idGen, swatch, clamp, finiteNum, posSize, intCount } from "./shared.js";
import { fillRamp, elevation, type Depth } from "../theme/depth.js";

// ───────────────────────── Bar graph (data) ─────────────────────────

export interface BarGraphDatum {
  /** Category label drawn under the bar. */
  label: string;
  /** Bar value; scaled against `maxValue` for its height. */
  value: number;
  /** Override the bar fill; defaults to the cycling theme swatch. */
  color?: string;
}

export interface BarGraphOptions {
  id?: string;
  /** Top-left placement of the graph box. */
  x?: number;
  y?: number;
  /** Pixel size of the graph box. Default 360 × 220. */
  width?: number;
  height?: number;
  /** The bars, drawn left → right. */
  bars: BarGraphDatum[];
  /** Value mapped to a full-height bar. Default = the largest bar value. */
  maxValue?: number;
  theme?: string;
  /** Dimensionality of the bars (gradient + crisp lift). Default "soft"; "flat" = solid fills. */
  depth?: Depth;
}

/** A vertical bar graph: baseline axis + one rect per datum, with value + category labels. */
export function buildBarGraph(opts: BarGraphOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "bargraph";
  const nid = idGen(prefix);
  const w = posSize(opts.width, 360);
  const h = posSize(opts.height, 220);
  // Degenerate `bars` (non-array / empty) yields a valid baseline-only group; cap
  // the count so an absurdly large array can't blow the loop / node budget.
  const bars = Array.isArray(opts.bars) ? opts.bars : [];
  const count = intCount(bars.length, 0);
  const n = Math.max(1, count);

  // Reserve vertical space: value readouts above the tallest bar, category labels
  // below the baseline. What's left between them is the plotting height.
  const topPad = 26; // room for the value counter above a full-height bar
  const labelPad = 30; // room for the category label below the baseline
  const baselineY = h - labelPad;
  const plotHeight = Math.max(0, baselineY - topPad);

  // Largest value maps to a full-height bar (guard against a zero/negative max).
  const dataMax = bars.slice(0, count).reduce((m, b) => Math.max(m, finiteNum(b?.value, 0, 0)), 0);
  const maxValue = finiteNum(opts.maxValue, dataMax);
  const denom = maxValue > 0 ? maxValue : 1;

  const colW = w / n; // each bar gets an equal column
  const barW = colW * 0.62; // leave a gap between bars
  const depth = opts.depth ?? "soft";

  const children: Node[] = [
    // baseline axis
    {
      id: nid(),
      type: "polyline",
      points: [
        { x: 0, y: baselineY },
        { x: w, y: baselineY },
      ],
      stroke: theme.palette.text,
      strokeWidth: 3,
      lineCap: "round",
    },
  ];

  for (let i = 0; i < count; i++) {
    const bar = bars[i];
    const value = finiteNum(bar?.value, 0, 0); // finite, non-negative
    const cx = colW * i + colW / 2; // column center
    const ratio = clamp(value / denom, 0, 1);
    const barH = ratio * plotHeight;
    const barY = baselineY - barH;
    const fill = bar?.color ?? swatch(theme, i);
    // Text nodes require a non-empty string; fall back so a blank label stays valid.
    const label = typeof bar?.label === "string" && bar.label.length > 0 ? bar.label : " ";

    // the bar — a vertical fill ramp (lighter top → base) with a crisp lift, so it reads as a
    // dimensional object rather than a flat block. `fill` stays as the flat/`depth:"flat"` fallback.
    children.push({
      id: nid(),
      type: "rect",
      x: cx - barW / 2,
      y: barY,
      width: barW,
      height: barH,
      fill,
      ...(fillRamp(fill, barH, depth) ? { gradient: fillRamp(fill, barH, depth)! } : {}),
      ...(elevation(depth) ? { shadow: elevation(depth)! } : {}),
      radius: 7,
    });

    // value readout above the bar
    children.push({
      id: nid(),
      type: "counter",
      x: cx,
      y: barY - 6,
      value,
      decimals: Number.isInteger(value) ? 0 : 1,
      fontSize: 18,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.text,
      align: "center",
      baseline: "bottom",
    });

    // category label below the baseline
    children.push({
      id: nid(),
      type: "text",
      x: cx,
      y: baselineY + 8,
      text: label,
      fontSize: 15,
      fontFamily: theme.bodyFont,
      fontWeight: theme.bodyWeight,
      fill: theme.palette.muted,
      align: "center",
      baseline: "top",
    });
  }

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
