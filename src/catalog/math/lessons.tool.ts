/**
 * Scene-level math tools: each wraps one buildMathLesson topic as a whole-scene builder.
 *
 * buildMathLesson defaults every param, so these schemas are deliberately small — the
 * common dims plus the genuinely useful per-topic knobs for the headline algebra topics
 * (graphing/quadratic/fraction). Non-algebra topics start with the dims-only schema and
 * grow lazily (per the catalog plan); the builder fills sensible defaults regardless.
 */

import { z, type ZodType } from "zod";
import { buildMathLesson, type MathLessonOptions, type MathTopic } from "../../math/lessons.js";
import type { BuilderTool } from "../types.js";

const dims = {
  theme: z.string().optional().describe("palette theme name"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().int().positive().optional(),
};

const dimsOnly = z.object(dims);
const withCount = z.object({ count: z.number().int().min(1).max(10).optional().describe("how many items (1–10)"), ...dims });
const graphing = z.object({ m: z.number().optional().describe("slope"), b: z.number().optional().describe("y-intercept"), ...dims });
const quadratic = z.object({
  a: z.number().optional().describe("x^2 coefficient"),
  b: z.number().optional().describe("x coefficient"),
  c: z.number().optional().describe("constant term"),
  ...dims,
});
const fraction = z.object({
  numerator: z.number().int().optional(),
  denominator: z.number().int().positive().optional(),
  ...dims,
});

function lessonTool(
  name: string,
  topic: MathTopic,
  schema: ZodType,
  description: string,
  keywords: string[],
  example: unknown,
): BuilderTool {
  return {
    name,
    domain: "math",
    level: "scene",
    description,
    keywords,
    params: schema,
    example,
    buildScene: (p) => buildMathLesson(topic, p as MathLessonOptions),
  };
}

/** One scene-level tool per buildMathLesson topic. */
export const mathLessonTools: BuilderTool[] = [
  lessonTool("math.countingLesson", "counting", withCount, "count a set of items one by one", ["count", "counting", "how many", "number"], {
    count: 3,
  }),
  lessonTool(
    "math.additionLesson",
    "addition",
    withCount,
    "add two quantities on a number line",
    ["add", "addition", "plus", "sum", "altogether"],
    { count: 5 },
  ),
  lessonTool(
    "math.subtractionLesson",
    "subtraction",
    withCount,
    "subtract on a number line",
    ["subtract", "subtraction", "minus", "take away", "difference"],
    { count: 5 },
  ),
  lessonTool(
    "math.multiplicationLesson",
    "multiplication",
    withCount,
    "multiplication as an array / repeated groups",
    ["multiply", "multiplication", "times", "array", "groups of"],
    { count: 3 },
  ),
  lessonTool(
    "math.divisionLesson",
    "division",
    withCount,
    "division as sharing / grouping",
    ["divide", "division", "share", "split", "groups"],
    {},
  ),
  lessonTool(
    "math.fractionLesson",
    "fraction",
    fraction,
    "show a fraction as a shaded pie",
    ["fraction", "pie", "part of a whole", "numerator", "denominator"],
    { numerator: 3, denominator: 4 },
  ),
  lessonTool("math.decimalLesson", "decimal", dimsOnly, "introduce decimals", ["decimal", "tenths", "point"], {}),
  lessonTool("math.percentLesson", "percent", dimsOnly, "show a percentage as a ring", ["percent", "percentage", "out of 100"], {}),
  lessonTool(
    "math.placeValueLesson",
    "place-value",
    dimsOnly,
    "place value with base-ten blocks",
    ["place value", "tens", "ones", "hundreds", "base ten"],
    {},
  ),
  lessonTool(
    "math.geometryLesson",
    "geometry",
    dimsOnly,
    "a labeled shape with angles/sides",
    ["geometry", "shape", "angle", "polygon", "sides"],
    {},
  ),
  lessonTool(
    "math.graphingLesson",
    "graphing",
    graphing,
    "plot a line y = mx + b on a coordinate plane",
    ["graph", "line", "slope", "y = mx + b", "coordinate plane", "plot"],
    { m: 2, b: 1 },
  ),
  lessonTool(
    "math.quadraticLesson",
    "quadratic",
    quadratic,
    "plot a parabola y = ax^2 + bx + c",
    ["quadratic", "parabola", "y = ax^2", "vertex"],
    { a: 1, b: 0, c: 0 },
  ),
  lessonTool(
    "math.equationLesson",
    "equation",
    dimsOnly,
    "solve an equation with a balance scale",
    ["equation", "solve", "balance", "unknown", "variable"],
    {},
  ),
  lessonTool("math.dataLesson", "data", dimsOnly, "show data as a bar graph", ["data", "bar graph", "chart", "bars"], {}),
];
