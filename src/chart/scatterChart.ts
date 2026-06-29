/**
 * Scatter chart — numeric points across linear x/y axes, one color per series, with an optional
 * pop-in. Pure; renders into the shared scaffold.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import { chartScaffold, type ChartBox } from "./scaffold.js";
import { seriesColor } from "./palette.js";
import type { TickFormat } from "./format.js";

export interface ScatterSeries {
  name: string;
  points: { x: number; y: number }[];
  color?: Color;
}

export interface ScatterChartOptions {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  theme?: string;
  title?: string;
  background?: Color;
  series: ScatterSeries[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  xFormat?: TickFormat;
  yFormat?: TickFormat;
  radius?: number;
  animate?: boolean;
}

export function scatterChart(opts: ScatterChartOptions): GroupNode {
  const id = opts.id ?? "scatter";
  const colors = opts.series.map((s, i) => s.color ?? seriesColor(opts.theme, i));
  const r = opts.radius ?? 5;
  const allX = opts.series.flatMap((s) => s.points.map((p) => p.x));
  const allY = opts.series.flatMap((s) => s.points.map((p) => p.y));

  const box: ChartBox = { x: opts.x, y: opts.y, width: opts.width, height: opts.height };
  const sc = chartScaffold({
    id,
    box,
    ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
    ...(opts.title !== undefined ? { title: opts.title } : {}),
    ...(opts.background !== undefined ? { background: opts.background } : {}),
    y: {
      min: opts.yMin ?? Math.min(...allY, 0),
      max: opts.yMax ?? Math.max(...allY, 1),
      ...(opts.yFormat !== undefined ? { format: opts.yFormat } : {}),
    },
    x: {
      kind: "linear",
      min: opts.xMin ?? Math.min(...allX, 0),
      max: opts.xMax ?? Math.max(...allX, 1),
      ...(opts.xFormat !== undefined ? { format: opts.xFormat } : {}),
    },
    ...(opts.series.length > 1 ? { legend: opts.series.map((s, i) => ({ name: s.name, color: colors[i]! })) } : {}),
    padTop: false,
  });

  const nodes: Node[] = [...sc.nodes];
  let n = 0;
  opts.series.forEach((s, si) => {
    s.points.forEach((p, pi) => {
      const cx = sc.xLinear(p.x);
      const cy = sc.yScale(p.y);
      const dot: Node = {
        id: `${id}-pt-${si}-${pi}`,
        type: "ellipse",
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        fill: colors[si]!,
        stroke: "#ffffff",
        strokeWidth: 1.5,
        anchor: { x: r, y: r },
      };
      if (opts.animate) {
        const start = Math.min(1.2, n * 0.02);
        const pop: Track[] = [
          {
            property: "scale",
            keyframes: [
              { t: start, value: 0 },
              { t: start + 0.4, value: 1, easing: "easeOutBack" },
            ],
          },
          {
            property: "opacity",
            keyframes: [
              { t: start, value: 0 },
              { t: start + 0.25, value: 1 },
            ],
          },
        ];
        dot.tracks = pop;
      }
      nodes.push(dot);
      n++;
    });
  });

  return { id, type: "group", x: 0, y: 0, children: nodes };
}
