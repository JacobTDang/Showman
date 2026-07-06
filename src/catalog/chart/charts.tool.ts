import { z } from "zod";
import { barChart } from "../../chart/barChart.js";
import { lineChart } from "../../chart/lineChart.js";
import { areaChart } from "../../chart/areaChart.js";
import { scatterChart } from "../../chart/scatterChart.js";
import type { BuilderTool } from "../types.js";

const TICK_FORMATS = ["number", "currency", "percent", "compact"] as const;

/** chart.bar — a bar chart, one or more series, optionally stacked. */
const BarParams = z.object({
  categories: z.array(z.string()).min(1).max(20),
  series: z
    .array(z.object({ name: z.string(), values: z.array(z.number()) }))
    .min(1)
    .max(6),
  stacked: z.boolean().default(false),
  title: z.string().optional(),
  width: z.number().positive().max(1200).default(400),
  height: z.number().positive().max(800).default(280),
  yFormat: z.enum(TICK_FORMATS).default("number"),
  animate: z.boolean().default(true),
  theme: z.string().optional(),
});
type BarParams = z.infer<typeof BarParams>;

export const barChartTool: BuilderTool<BarParams> = {
  name: "chart.bar",
  domain: "chart",
  level: "node",
  description: "a bar chart across categories, one or more series, optionally stacked",
  keywords: ["bar chart", "bars", "categories", "compare", "stacked bar", "data"],
  params: BarParams,
  example: {
    categories: ["Q1", "Q2", "Q3"],
    series: [{ name: "Revenue", values: [10, 15, 12] }],
    stacked: false,
    width: 400,
    height: 280,
    yFormat: "number",
    animate: true,
  },
  build(p) {
    return { node: barChart({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height + (p.title ? 30 : 0) } };
  },
};

/** chart.line — one or more x/y line series on a shared axis. */
const LineParams = z.object({
  series: z
    .array(z.object({ name: z.string(), points: z.array(z.object({ x: z.number(), y: z.number() })).min(2) }))
    .min(1)
    .max(6),
  title: z.string().optional(),
  width: z.number().positive().max(1200).default(420),
  height: z.number().positive().max(800).default(280),
  yFormat: z.enum(TICK_FORMATS).default("number"),
  theme: z.string().optional(),
});
type LineParams = z.infer<typeof LineParams>;

export const lineChartTool: BuilderTool<LineParams> = {
  name: "chart.line",
  domain: "chart",
  level: "node",
  description: "one or more x/y line series on a shared axis — trends over a continuous variable",
  keywords: ["line chart", "trend", "time series", "plot", "series", "data over time"],
  params: LineParams,
  example: {
    series: [
      {
        name: "Temp",
        points: [
          { x: 0, y: 10 },
          { x: 1, y: 15 },
          { x: 2, y: 12 },
        ],
      },
    ],
    width: 420,
    height: 280,
    yFormat: "number",
  },
  build(p) {
    return { node: lineChart({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height + (p.title ? 30 : 0) } };
  },
};

/** chart.area — a single filled area series (cumulative/volume-style trends). */
const AreaParams = z.object({
  points: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .min(2)
    .max(60),
  title: z.string().optional(),
  width: z.number().positive().max(1200).default(420),
  height: z.number().positive().max(800).default(280),
  theme: z.string().optional(),
});
type AreaParams = z.infer<typeof AreaParams>;

export const areaChartTool: BuilderTool<AreaParams> = {
  name: "chart.area",
  domain: "chart",
  level: "node",
  description: "a single filled area series — cumulative totals or volume-style trends",
  keywords: ["area chart", "filled area", "cumulative", "volume", "trend"],
  params: AreaParams,
  example: {
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 5 },
      { x: 2, y: 8 },
    ],
    width: 420,
    height: 280,
  },
  build(p) {
    return { node: areaChart({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height + (p.title ? 30 : 0) } };
  },
};

/** chart.scatter — one or more x/y point clouds. */
const ScatterParams = z.object({
  series: z
    .array(z.object({ name: z.string(), points: z.array(z.object({ x: z.number(), y: z.number() })).min(1) }))
    .min(1)
    .max(6),
  title: z.string().optional(),
  width: z.number().positive().max(1200).default(400),
  height: z.number().positive().max(800).default(280),
  theme: z.string().optional(),
});
type ScatterParams = z.infer<typeof ScatterParams>;

export const scatterChartTool: BuilderTool<ScatterParams> = {
  name: "chart.scatter",
  domain: "chart",
  level: "node",
  description: "one or more x/y point clouds — correlation, distribution, clustering",
  keywords: ["scatter plot", "scatter chart", "correlation", "points", "distribution", "clusters"],
  params: ScatterParams,
  example: {
    series: [
      {
        name: "Sample",
        points: [
          { x: 1, y: 2 },
          { x: 2, y: 3 },
          { x: 3, y: 2.5 },
        ],
      },
    ],
    width: 400,
    height: 280,
  },
  build(p) {
    return { node: scatterChart({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height + (p.title ? 30 : 0) } };
  },
};
