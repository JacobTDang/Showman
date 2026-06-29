/**
 * Line chart — multiple numeric series over a linear x axis. Lines draw on left→right when animated;
 * optional point markers. Pure; renders into the shared scaffold.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import { chartScaffold, type ChartBox } from "./scaffold.js";
import { seriesColor } from "./palette.js";
import type { TickFormat } from "./format.js";

export interface LinePoint {
  x: number;
  y: number;
}
export interface LineSeries {
  name: string;
  points: LinePoint[];
  color?: Color;
}

export interface LineChartOptions {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  theme?: string;
  title?: string;
  background?: Color;
  series: LineSeries[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  xFormat?: TickFormat;
  yFormat?: TickFormat;
  xTicks?: number;
  yTicks?: number;
  showPoints?: boolean;
  /** Draw the lines on left→right. Default false. */
  animate?: boolean;
}

export function lineChart(opts: LineChartOptions): GroupNode {
  const id = opts.id ?? "line";
  const colors = opts.series.map((s, i) => s.color ?? seriesColor(opts.theme, i));
  const allX = opts.series.flatMap((s) => s.points.map((p) => p.x));
  const allY = opts.series.flatMap((s) => s.points.map((p) => p.y));
  const xMin = opts.xMin ?? Math.min(...allX, 0);
  const xMax = opts.xMax ?? Math.max(...allX, 1);
  const yMin = opts.yMin ?? Math.min(...allY, 0);
  const yMax = opts.yMax ?? Math.max(...allY, 1);

  const box: ChartBox = { x: opts.x, y: opts.y, width: opts.width, height: opts.height };
  const sc = chartScaffold({
    id,
    box,
    ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
    ...(opts.title !== undefined ? { title: opts.title } : {}),
    ...(opts.background !== undefined ? { background: opts.background } : {}),
    y: {
      min: yMin,
      max: yMax,
      ...(opts.yTicks !== undefined ? { ticks: opts.yTicks } : {}),
      ...(opts.yFormat !== undefined ? { format: opts.yFormat } : {}),
    },
    x: {
      kind: "linear",
      min: xMin,
      max: xMax,
      ...(opts.xTicks !== undefined ? { ticks: opts.xTicks } : {}),
      ...(opts.xFormat !== undefined ? { format: opts.xFormat } : {}),
    },
    ...(opts.series.length > 1 ? { legend: opts.series.map((s, i) => ({ name: s.name, color: colors[i]! })) } : {}),
    padTop: false,
  });

  const nodes: Node[] = [...sc.nodes];
  opts.series.forEach((s, si) => {
    const pts = s.points.map((p) => ({ x: sc.xLinear(p.x), y: sc.yScale(p.y) }));
    if (pts.length >= 2) {
      const line: Node = { id: `${id}-line-${si}`, type: "polyline", x: 0, y: 0, points: pts, stroke: colors[si]!, strokeWidth: 3 };
      if (opts.animate) {
        line.progress = 0;
        const draw: Track[] = [
          {
            property: "progress",
            keyframes: [
              { t: 0, value: 0 },
              { t: 1.2, value: 1, easing: "easeOutCubic" },
            ],
          },
        ];
        line.tracks = draw;
      }
      nodes.push(line);
    }
    if (opts.showPoints) {
      pts.forEach((p, pi) => {
        const dot: Node = {
          id: `${id}-pt-${si}-${pi}`,
          type: "ellipse",
          x: p.x - 4,
          y: p.y - 4,
          width: 8,
          height: 8,
          fill: colors[si]!,
          stroke: "#ffffff",
          strokeWidth: 1.5,
        };
        nodes.push(dot);
      });
    }
  });

  return { id, type: "group", x: 0, y: 0, children: nodes };
}
