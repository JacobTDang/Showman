/**
 * Bar chart — grouped or stacked vertical bars with gradient fills and soft shadows; bars grow from
 * the baseline when animated. Pure; renders into the shared scaffold.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import { chartScaffold, type ChartBox } from "./scaffold.js";
import { seriesColor } from "./palette.js";
import { lighten } from "../engine/color.js";
import type { TickFormat } from "./format.js";

export interface BarSeries {
  name: string;
  values: number[];
  color?: Color;
}

export interface BarChartOptions {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  theme?: string;
  title?: string;
  background?: Color;
  categories: string[];
  series: BarSeries[];
  stacked?: boolean;
  yMax?: number;
  yTicks?: number;
  yFormat?: TickFormat;
  /** Grow the bars from the baseline. Default false. */
  animate?: boolean;
}

export function barChart(opts: BarChartOptions): GroupNode {
  const id = opts.id ?? "bar";
  const stacked = opts.stacked ?? false;
  const colors = opts.series.map((s, i) => s.color ?? seriesColor(opts.theme, i));

  let dataMax = 0;
  if (stacked) {
    opts.categories.forEach((_, ci) => {
      const sum = opts.series.reduce((acc, s) => acc + Math.max(0, s.values[ci] ?? 0), 0);
      dataMax = Math.max(dataMax, sum);
    });
  } else {
    opts.series.forEach((s) => s.values.forEach((v) => (dataMax = Math.max(dataMax, v))));
  }

  const box: ChartBox = { x: opts.x, y: opts.y, width: opts.width, height: opts.height };
  const sc = chartScaffold({
    id,
    box,
    ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
    ...(opts.title !== undefined ? { title: opts.title } : {}),
    ...(opts.background !== undefined ? { background: opts.background } : {}),
    y: {
      min: 0,
      max: opts.yMax ?? dataMax,
      ...(opts.yTicks !== undefined ? { ticks: opts.yTicks } : {}),
      ...(opts.yFormat !== undefined ? { format: opts.yFormat } : {}),
    },
    x: { kind: "band", categories: opts.categories },
    ...(opts.series.length > 1 ? { legend: opts.series.map((s, i) => ({ name: s.name, color: colors[i]! })) } : {}),
  });

  const baseline = sc.yScale(0);
  const nodes: Node[] = [...sc.nodes];
  opts.categories.forEach((_, ci) => {
    let stackTop = 0;
    opts.series.forEach((s, si) => {
      const v = s.values[ci] ?? 0;
      let bx: number;
      let bw: number;
      let topY: number;
      let h: number;
      if (stacked) {
        bw = sc.bandwidth;
        bx = sc.xBand(ci);
        const y0 = sc.yScale(stackTop);
        const y1 = sc.yScale(stackTop + v);
        topY = Math.min(y0, y1);
        h = Math.abs(y0 - y1);
        stackTop += v;
      } else {
        const subW = sc.bandwidth / opts.series.length;
        bw = subW * 0.86;
        bx = sc.xBand(ci) + si * subW + (subW - bw) / 2;
        topY = sc.yScale(v);
        h = baseline - topY;
      }
      if (h <= 0.5) return;
      const color = colors[si]!;
      const bar: Node = {
        id: `${id}-bar-${ci}-${si}`,
        type: "rect",
        x: bx,
        y: topY,
        width: bw,
        height: h,
        radius: Math.min(6, bw / 2),
        gradient: {
          type: "linear",
          from: { x: 0, y: 0 },
          to: { x: 0, y: h },
          stops: [
            { offset: 0, color: lighten(color, 0.18) },
            { offset: 1, color },
          ],
        },
        shadow: { color: "rgba(15,23,42,0.18)", blur: 5, offsetY: 2 },
      };
      if (opts.animate) {
        bar.anchor = { x: 0, y: h }; // scale from the baseline
        const grow: Track[] = [
          {
            property: "scaleY",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.7, value: 1, easing: "easeOutCubic" },
            ],
          },
        ];
        bar.tracks = grow;
      }
      nodes.push(bar);
    });
  });

  return { id, type: "group", x: 0, y: 0, children: nodes };
}
