/**
 * Chart scaffold — the shared frame every chart type renders into: a plot area inset from the card
 * for a title, legend, and axis labels; a value (y) axis with gridlines + formatted ticks; and an x
 * axis that is either categorical (band) or numeric (linear). Returns the plot rect, scale
 * functions, and the scaffold nodes. Pure; composes rect + polyline + text.
 */

import type { Node, Color } from "../spec/types.js";
import { getTheme } from "../theme/themes.js";
import { approxTextWidth } from "../math/shared.js";
import { formatTick, niceCeil, type TickFormat } from "./format.js";

export interface ChartBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LegendEntry {
  name: string;
  color: Color;
}

export type XAxis =
  { kind: "band"; categories: string[] } | { kind: "linear"; min: number; max: number; ticks?: number; format?: TickFormat };

export interface ScaffoldOptions {
  id: string;
  box: ChartBox;
  theme?: string;
  title?: string;
  background?: Color;
  y: { min: number; max: number; ticks?: number; format?: TickFormat };
  x: XAxis;
  legend?: LegendEntry[];
  /** Pad the value axis so bars/points don't touch the top. Default true. */
  padTop?: boolean;
}

export interface Scaffold {
  plot: ChartBox;
  /** value → pixel-y. */
  yScale: (v: number) => number;
  /** numeric x → pixel-x (linear axes only). */
  xLinear: (v: number) => number;
  /** band start x for category i (band axes only). */
  xBand: (i: number) => number;
  bandwidth: number;
  nodes: Node[];
}

const TITLE_SIZE = 20;
const LABEL_SIZE = 13;

export function chartScaffold(opts: ScaffoldOptions): Scaffold {
  const { id, box } = opts;
  const theme = getTheme(opts.theme);
  const text = theme.palette.text;
  const muted = theme.palette.muted;
  const grid = "#e2e8f0";
  const yTicks = Math.max(2, opts.y.ticks ?? 5);
  const yMax = opts.padTop === false ? opts.y.max : niceCeil(opts.y.max);
  const yMin = opts.y.min;
  const yFmt = opts.y.format ?? "number";

  // Tick label widths → left inset.
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);
  const maxLabelW = Math.max(...yTickVals.map((v) => approxTextWidth(formatTick(v, yFmt), LABEL_SIZE)), 10);

  const titleH = opts.title ? TITLE_SIZE * 1.7 : 0;
  const legendH = opts.legend && opts.legend.length > 0 ? LABEL_SIZE * 1.9 : 0;
  const topInset = titleH + legendH + 6;
  const leftInset = maxLabelW + 14;
  const bottomInset = LABEL_SIZE * 1.9;
  const rightInset = 14;
  const plot: ChartBox = {
    x: box.x + leftInset,
    y: box.y + topInset,
    width: Math.max(1, box.width - leftInset - rightInset),
    height: Math.max(1, box.height - topInset - bottomInset),
  };

  const nodes: Node[] = [];
  if (opts.background !== undefined) {
    nodes.push({
      id: `${id}-bg`,
      type: "rect",
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      radius: 12,
      fill: opts.background,
    });
  }
  if (opts.title !== undefined) {
    nodes.push({
      id: `${id}-title`,
      type: "text",
      x: box.x,
      y: box.y + 4,
      text: opts.title,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fontSize: TITLE_SIZE,
      fill: text,
      align: "left",
      baseline: "top",
    });
  }
  // Legend row (under the title).
  if (opts.legend) {
    let lx = box.x;
    const ly = box.y + titleH + LABEL_SIZE * 0.4;
    opts.legend.forEach((e, i) => {
      nodes.push({ id: `${id}-leg-sw-${i}`, type: "rect", x: lx, y: ly, width: 14, height: 14, radius: 3, fill: e.color });
      nodes.push({
        id: `${id}-leg-tx-${i}`,
        type: "text",
        x: lx + 20,
        y: ly + 7,
        text: e.name,
        fontFamily: theme.bodyFont,
        fontSize: LABEL_SIZE,
        fill: muted,
        align: "left",
        baseline: "middle",
      });
      lx += 20 + approxTextWidth(e.name, LABEL_SIZE) + 22;
    });
  }

  const yScale = (v: number): number => plot.y + plot.height - ((v - yMin) / (yMax - yMin || 1)) * plot.height;

  // y gridlines + ticks.
  yTickVals.forEach((v, i) => {
    const py = yScale(v);
    nodes.push({
      id: `${id}-grid-${i}`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: plot.x, y: py },
        { x: plot.x + plot.width, y: py },
      ],
      stroke: grid,
      strokeWidth: 1,
    });
    nodes.push({
      id: `${id}-ytick-${i}`,
      type: "text",
      x: plot.x - 8,
      y: py,
      text: formatTick(v, yFmt),
      fontFamily: theme.bodyFont,
      fontSize: LABEL_SIZE,
      fill: muted,
      align: "right",
      baseline: "middle",
    });
  });

  // x axis.
  let bandwidth = 0;
  const xBand = (i: number): number =>
    plot.x +
    i * (plot.width / Math.max(1, opts.x.kind === "band" ? opts.x.categories.length : 1)) +
    (plot.width / Math.max(1, opts.x.kind === "band" ? opts.x.categories.length : 1)) * 0.15;
  const xLinear = (v: number): number => {
    if (opts.x.kind !== "linear") return plot.x;
    return plot.x + ((v - opts.x.min) / (opts.x.max - opts.x.min || 1)) * plot.width;
  };
  if (opts.x.kind === "band") {
    const n = Math.max(1, opts.x.categories.length);
    const step = plot.width / n;
    bandwidth = step * 0.7;
    opts.x.categories.forEach((cat, i) => {
      nodes.push({
        id: `${id}-xcat-${i}`,
        type: "text",
        x: plot.x + (i + 0.5) * step,
        y: plot.y + plot.height + 8,
        text: cat,
        fontFamily: theme.bodyFont,
        fontSize: LABEL_SIZE,
        fill: muted,
        align: "center",
        baseline: "top",
        maxWidth: step,
      });
    });
  } else {
    const n = opts.x.ticks ?? 5;
    for (let i = 0; i <= n; i++) {
      const v = opts.x.min + ((opts.x.max - opts.x.min) * i) / n;
      nodes.push({
        id: `${id}-xtick-${i}`,
        type: "text",
        x: xLinear(v),
        y: plot.y + plot.height + 8,
        text: formatTick(v, opts.x.format ?? "number"),
        fontFamily: theme.bodyFont,
        fontSize: LABEL_SIZE,
        fill: muted,
        align: "center",
        baseline: "top",
      });
    }
  }
  // x baseline.
  nodes.push({
    id: `${id}-axis`,
    type: "polyline",
    x: 0,
    y: 0,
    points: [
      { x: plot.x, y: plot.y + plot.height },
      { x: plot.x + plot.width, y: plot.y + plot.height },
    ],
    stroke: "#94a3b8",
    strokeWidth: 1.5,
  });

  return { plot, yScale, xLinear, xBand: (i: number): number => (opts.x.kind === "band" ? xBand(i) : plot.x), bandwidth, nodes };
}
