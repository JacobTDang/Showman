/**
 * Candlestick chart — OHLC candles over a categorical x axis (finance). A green body for an up day
 * (close ≥ open), red for a down day, with a high–low wick. Optional grow-in. Pure; renders into the
 * shared scaffold.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import { chartScaffold, type ChartBox } from "./scaffold.js";
import type { TickFormat } from "./format.js";

export interface Candle {
  label?: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CandlestickOptions {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  theme?: string;
  title?: string;
  background?: Color;
  candles: Candle[];
  upColor?: Color;
  downColor?: Color;
  yFormat?: TickFormat;
  yTicks?: number;
  animate?: boolean;
}

export function candlestick(opts: CandlestickOptions): GroupNode {
  const id = opts.id ?? "candle";
  const up = opts.upColor ?? "#16a34a";
  const down = opts.downColor ?? "#dc2626";
  const lows = opts.candles.map((c) => c.low);
  const highs = opts.candles.map((c) => c.high);
  const yMin = Math.min(...lows);
  const yMax = Math.max(...highs);
  const pad = (yMax - yMin) * 0.08 || 1;

  const box: ChartBox = { x: opts.x, y: opts.y, width: opts.width, height: opts.height };
  const sc = chartScaffold({
    id,
    box,
    ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
    ...(opts.title !== undefined ? { title: opts.title } : {}),
    ...(opts.background !== undefined ? { background: opts.background } : {}),
    y: {
      min: yMin - pad,
      max: yMax + pad,
      ...(opts.yTicks !== undefined ? { ticks: opts.yTicks } : {}),
      ...(opts.yFormat !== undefined ? { format: opts.yFormat } : {}),
    },
    x: { kind: "band", categories: opts.candles.map((c, i) => c.label ?? String(i + 1)) },
    padTop: false,
  });

  const nodes: Node[] = [...sc.nodes];
  opts.candles.forEach((c, i) => {
    const cx = sc.xBand(i) + sc.bandwidth / 2;
    const bw = Math.max(3, sc.bandwidth * 0.6);
    const isUp = c.close >= c.open;
    const color = isUp ? up : down;
    // Wick (high–low).
    nodes.push({
      id: `${id}-wick-${i}`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cx, y: sc.yScale(c.high) },
        { x: cx, y: sc.yScale(c.low) },
      ],
      stroke: color,
      strokeWidth: 1.5,
    });
    // Body (open–close).
    const yTop = sc.yScale(Math.max(c.open, c.close));
    const yBot = sc.yScale(Math.min(c.open, c.close));
    const h = Math.max(1.5, yBot - yTop);
    const body: Node = { id: `${id}-body-${i}`, type: "rect", x: cx - bw / 2, y: yTop, width: bw, height: h, radius: 1.5, fill: color };
    if (opts.animate) {
      const start = Math.min(1.0, i * 0.04);
      const grow: Track[] = [
        {
          property: "opacity",
          keyframes: [
            { t: start, value: 0 },
            { t: start + 0.3, value: 1 },
          ],
        },
      ];
      body.tracks = grow;
    }
    nodes.push(body);
  });

  return { id, type: "group", x: 0, y: 0, children: nodes };
}
