import { z } from "zod";
import { buildArrayGrid } from "../../math/arrayGrid.js";
import { buildDotPattern } from "../../math/dotPattern.js";
import { buildBaseTenBlocks } from "../../math/baseTenBlocks.js";
import { buildAreaGrid } from "../../math/areaGrid.js";
import { buildNumberSentence } from "../../math/numberSentence.js";
import { buildBarGraph } from "../../math/barGraph.js";
import { buildPictograph } from "../../math/pictograph.js";
import { buildPercentRing } from "../../math/percentRing.js";
import { buildNumberLineFraction } from "../../math/numberLineFraction.js";
import type { BuilderTool } from "../types.js";

/** math.arrayGrid — a rows x cols dot array for multiplication. */
const ArrayGridParams = z.object({
  rows: z.number().int().min(1).max(12),
  cols: z.number().int().min(1).max(12),
});
type ArrayGridParams = z.infer<typeof ArrayGridParams>;
export const arrayGridTool: BuilderTool<ArrayGridParams> = {
  name: "math.arrayGrid",
  domain: "math",
  level: "node",
  description: "a rows x cols array of dots — the area model for multiplication",
  keywords: ["multiply", "multiplication", "array", "rows", "columns", "groups of", "times"],
  params: ArrayGridParams,
  example: { rows: 3, cols: 4 },
  build(p) {
    const gap = 40;
    return { node: buildArrayGrid(p), bbox: { w: p.cols * gap + 24, h: p.rows * gap + 24 } };
  },
};

/** math.dotPattern — a subitizing dot pattern (dice face 1-6, ten-frame 7-10). */
const DotPatternParams = z.object({ n: z.number().int().min(1).max(10), size: z.number().positive().max(400).default(120) });
type DotPatternParams = z.infer<typeof DotPatternParams>;
export const dotPatternTool: BuilderTool<DotPatternParams> = {
  name: "math.dotPattern",
  domain: "math",
  level: "node",
  description: "a subitizing dot pattern: a dice face (1-6) or a ten-frame (7-10)",
  keywords: ["dots", "subitize", "dice", "how many", "pattern", "count"],
  params: DotPatternParams,
  example: { n: 5, size: 120 },
  build(p) {
    return { node: buildDotPattern(p), bbox: { w: p.size, h: p.size } };
  },
};

/** math.baseTenBlocks — hundreds/tens/ones place-value blocks. */
const BaseTenParams = z.object({
  hundreds: z.number().int().min(0).max(9).default(0),
  tens: z.number().int().min(0).max(9).default(0),
  ones: z.number().int().min(0).max(9).default(0),
  unit: z.number().positive().max(60).default(16),
});
type BaseTenParams = z.infer<typeof BaseTenParams>;
export const baseTenBlocksTool: BuilderTool<BaseTenParams> = {
  name: "math.baseTenBlocks",
  domain: "math",
  level: "node",
  description: "place-value blocks: hundreds flats, tens rods, ones units",
  keywords: ["place value", "tens", "ones", "hundreds", "base ten", "blocks"],
  params: BaseTenParams,
  example: { hundreds: 1, tens: 2, ones: 3, unit: 16 },
  build(p) {
    const cols = Math.max(1, p.hundreds + p.tens + p.ones);
    return { node: buildBaseTenBlocks(p), bbox: { w: cols * (p.unit + 8) + p.unit * 10, h: p.unit * 10 + 40 } };
  },
};

/** math.areaGrid — a rows x cols shaded-cell area model. */
const AreaGridParams = z.object({
  rows: z.number().int().min(1).max(40),
  cols: z.number().int().min(1).max(40),
  shaded: z.number().int().min(0).optional(),
  unit: z.number().positive().max(80).default(34),
});
type AreaGridParams = z.infer<typeof AreaGridParams>;
export const areaGridTool: BuilderTool<AreaGridParams> = {
  name: "math.areaGrid",
  domain: "math",
  level: "node",
  description: "a rows x cols grid of unit squares with dimension + area labels (the area model)",
  keywords: ["area", "grid", "rows", "columns", "square units", "multiplication"],
  params: AreaGridParams,
  example: { rows: 4, cols: 6, unit: 34 },
  build(p) {
    return { node: buildAreaGrid(p), bbox: { w: p.cols * p.unit + 60, h: p.rows * p.unit + 60 } };
  },
};

/** math.numberSentence — "a op b = result" with optional counting dots. */
const NumberSentenceParams = z.object({
  a: z.number(),
  op: z.enum(["+", "-", "×", "÷"]).describe('operator: "+", "-", "×", or "÷"'),
  b: z.number(),
  result: z.number(),
  showDots: z.boolean().default(true),
  theme: z.string().optional(),
});
type NumberSentenceParams = z.infer<typeof NumberSentenceParams>;
export const numberSentenceTool: BuilderTool<NumberSentenceParams> = {
  name: "math.numberSentence",
  domain: "math",
  level: "node",
  description: 'a number sentence "a op b = result" with counting dots under each operand',
  keywords: ["number sentence", "equation", "add", "subtract", "multiply", "divide", "sum", "difference"],
  params: NumberSentenceParams,
  example: { a: 3, op: "+", b: 2, result: 5, showDots: true },
  build(p) {
    return { node: buildNumberSentence(p), bbox: { w: 420, h: 140 } };
  },
};

/** math.barGraph — a vertical bar graph. */
const BarGraphParams = z.object({
  bars: z
    .array(z.object({ label: z.string(), value: z.number().min(0) }))
    .min(1)
    .max(10),
  width: z.number().positive().max(1000).default(360),
  height: z.number().positive().max(600).default(220),
});
type BarGraphParams = z.infer<typeof BarGraphParams>;
export const barGraphTool: BuilderTool<BarGraphParams> = {
  name: "math.barGraph",
  domain: "math",
  level: "node",
  description: "a vertical bar graph of labeled values",
  keywords: ["bar graph", "chart", "data", "bars", "compare"],
  params: BarGraphParams,
  example: {
    bars: [
      { label: "A", value: 3 },
      { label: "B", value: 5 },
    ],
    width: 360,
    height: 220,
  },
  build(p) {
    return { node: buildBarGraph(p), bbox: { w: p.width, h: p.height } };
  },
};

/** math.pictograph — icon rows keyed by a unit count. */
const PictographParams = z.object({
  rows: z
    .array(z.object({ label: z.string(), count: z.number().min(0) }))
    .min(1)
    .max(8),
  iconSize: z.number().positive().max(80).default(28),
  unit: z.number().positive().default(1),
});
type PictographParams = z.infer<typeof PictographParams>;
export const pictographTool: BuilderTool<PictographParams> = {
  name: "math.pictograph",
  domain: "math",
  level: "node",
  description: "a pictograph: icon rows, one icon per unit count, with a key",
  keywords: ["pictograph", "icons", "picture graph", "data", "key"],
  params: PictographParams,
  example: {
    rows: [
      { label: "Mon", count: 3 },
      { label: "Tue", count: 5 },
    ],
    iconSize: 28,
    unit: 1,
  },
  build(p) {
    const maxIcons = Math.max(...p.rows.map((r) => Math.ceil(r.count / p.unit)), 1);
    return { node: buildPictograph(p), bbox: { w: 120 + maxIcons * (p.iconSize + 8), h: p.rows.length * (p.iconSize + 16) + 40 } };
  },
};

/** math.percentRing — a percent-filled ring with a center counter. */
const PercentRingParams = z.object({ percent: z.number().min(0).max(100), radius: z.number().positive().max(300).default(80) });
type PercentRingParams = z.infer<typeof PercentRingParams>;
export const percentRingTool: BuilderTool<PercentRingParams> = {
  name: "math.percentRing",
  domain: "math",
  level: "node",
  description: "a percent-filled ring with a center percentage counter",
  keywords: ["percent", "percentage", "out of 100", "ring", "donut"],
  params: PercentRingParams,
  example: { percent: 75, radius: 80 },
  build(p) {
    const r = p.radius;
    return { node: buildPercentRing(p), bbox: { w: r * 2, h: r * 2 } };
  },
};

/** math.numberLineFraction — a fraction highlighted on a number line. */
const NumberLineFractionParams = z.object({
  numerator: z.number().int().min(0),
  denominator: z.number().int().positive(),
  whole: z.number().positive().default(1),
  width: z.number().positive().max(1000).default(360),
});
type NumberLineFractionParams = z.infer<typeof NumberLineFractionParams>;
export const numberLineFractionTool: BuilderTool<NumberLineFractionParams> = {
  name: "math.numberLineFraction",
  domain: "math",
  level: "node",
  description: "a fraction shown as a highlighted segment + marker on a number line",
  keywords: ["fraction", "number line", "numerator", "denominator", "segment"],
  params: NumberLineFractionParams,
  example: { numerator: 3, denominator: 4, whole: 1, width: 360 },
  build(p) {
    return { node: buildNumberLineFraction(p), bbox: { w: p.width, h: 80 } };
  },
};
