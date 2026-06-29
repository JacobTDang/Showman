/**
 * Area chart — a numeric series filled to the baseline with a vertical gradient (color → transparent)
 * and a crisp top line that draws on. Pure; renders into the shared scaffold.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import { chartScaffold, type ChartBox } from "./scaffold.js";
import { seriesColor } from "./palette.js";
import { withAlpha } from "../engine/color.js";
import type { TickFormat } from "./format.js";

export interface AreaPoint {
  x: number;
  y: number;
}

export interface AreaChartOptions {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  theme?: string;
  title?: string;
  background?: Color;
  points: AreaPoint[];
  color?: Color;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  xFormat?: TickFormat;
  yFormat?: TickFormat;
  xTicks?: number;
  yTicks?: number;
  /** Draw the top line on + fade the fill in. Default false. */
  animate?: boolean;
}

export function areaChart(opts: AreaChartOptions): GroupNode {
  const id = opts.id ?? "area";
  const color = opts.color ?? seriesColor(opts.theme, 0);
  const xs = opts.points.map((p) => p.x);
  const ys = opts.points.map((p) => p.y);
  const xMin = opts.xMin ?? Math.min(...xs, 0);
  const xMax = opts.xMax ?? Math.max(...xs, 1);
  const yMin = opts.yMin ?? Math.min(...ys, 0);
  const yMax = opts.yMax ?? Math.max(...ys, 1);

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
    padTop: false,
  });

  const nodes: Node[] = [...sc.nodes];
  const pts = opts.points.map((p) => ({ x: sc.xLinear(p.x), y: sc.yScale(p.y) }));
  if (pts.length >= 2) {
    const baseY = sc.plot.y + sc.plot.height;
    const areaPts = [{ x: pts[0]!.x, y: baseY }, ...pts, { x: pts[pts.length - 1]!.x, y: baseY }];
    const area: Node = {
      id: `${id}-fill`,
      type: "polyline",
      x: 0,
      y: 0,
      points: areaPts,
      closed: true,
      fill: color,
      gradient: {
        type: "linear",
        from: { x: 0, y: sc.plot.y },
        to: { x: 0, y: baseY },
        stops: [
          { offset: 0, color: withAlpha(color, 0.55) },
          { offset: 1, color: withAlpha(color, 0.04) },
        ],
      },
      stroke: "transparent",
      strokeWidth: 0,
    };
    const line: Node = { id: `${id}-line`, type: "polyline", x: 0, y: 0, points: pts, stroke: color, strokeWidth: 3 };
    if (opts.animate) {
      area.tracks = [
        {
          property: "opacity",
          keyframes: [
            { t: 0, value: 0 },
            { t: 1.0, value: 1 },
          ],
        },
      ];
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
    nodes.push(area, line);
  }

  return { id, type: "group", x: 0, y: 0, children: nodes };
}
