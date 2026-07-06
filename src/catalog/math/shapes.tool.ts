import { z } from "zod";
import { fractionCircle, fractionBar } from "../../math/builders.js";
import { buildAngle } from "../../math/angle.js";
import { buildLabeledShape } from "../../math/labeledShape.js";
import type { BuilderTool } from "../types.js";

/** math.fractionCircle — a pie showing numerator/denominator. */
const FractionParams = z.object({
  numerator: z.number().int().min(0).describe("parts shaded"),
  denominator: z.number().int().positive().describe("total equal parts"),
  radius: z.number().positive().max(300).default(80),
  theme: z.string().optional(),
});
type FractionParams = z.infer<typeof FractionParams>;

export const fractionCircleTool: BuilderTool<FractionParams> = {
  name: "math.fractionCircle",
  domain: "math",
  level: "node",
  description: "a fraction as a shaded pie (numerator/denominator)",
  keywords: ["fraction", "pie", "part of a whole", "numerator", "denominator", "circle"],
  params: FractionParams,
  example: { numerator: 3, denominator: 4, radius: 80 },
  build(p) {
    const node = fractionCircle(p);
    const r = p.radius;
    return { node, bbox: { w: r * 2, h: r * 2 } };
  },
};

/** math.fractionBar — a fraction as a shaded horizontal bar. */
const FractionBarParams = FractionParams.extend({
  width: z.number().positive().max(800).default(320),
  height: z.number().positive().max(300).default(60),
});
type FractionBarParams = z.infer<typeof FractionBarParams>;

export const fractionBarTool: BuilderTool<FractionBarParams> = {
  name: "math.fractionBar",
  domain: "math",
  level: "node",
  description: "a fraction as a shaded horizontal bar (numerator/denominator)",
  keywords: ["fraction", "bar", "part of a whole", "numerator", "denominator", "strip"],
  params: FractionBarParams,
  example: { numerator: 3, denominator: 4, width: 320, height: 60, radius: 80 },
  build(p) {
    return { node: fractionBar(p), bbox: { w: p.width, h: p.height } };
  },
};

/** math.angle — an angle wedge with a degree label. */
const AngleParams = z.object({
  degrees: z.number().describe("angle opening, degrees CCW from the rightward ray"),
  rayLength: z.number().positive().max(400).default(90),
  label: z.string().optional(),
  theme: z.string().optional(),
});
type AngleParams = z.infer<typeof AngleParams>;

export const angleTool: BuilderTool<AngleParams> = {
  name: "math.angle",
  domain: "math",
  level: "node",
  description: "an angle: two rays from a vertex with an arc wedge and a degree label",
  keywords: ["angle", "degrees", "vertex", "ray", "wedge", "geometry"],
  params: AngleParams,
  example: { degrees: 60, rayLength: 90 },
  build(p) {
    const r = p.rayLength;
    return { node: buildAngle(p), bbox: { w: r * 2.2, h: r * 2.2 } };
  },
};

/** math.labeledShape — a regular polygon with vertex/side labels. */
const LabeledShapeParams = z.object({
  sides: z.number().int().min(3).max(20),
  radius: z.number().positive().max(300).default(90),
  sideLabel: z.string().optional().describe("draws this label at every edge midpoint"),
  showAngle: z.boolean().default(false),
  theme: z.string().optional(),
});
type LabeledShapeParams = z.infer<typeof LabeledShapeParams>;

export const labeledShapeTool: BuilderTool<LabeledShapeParams> = {
  name: "math.labeledShape",
  domain: "math",
  level: "node",
  description: "a regular polygon with lettered vertices, optional side labels, and an angle marker",
  keywords: ["polygon", "shape", "sides", "vertices", "triangle", "square", "pentagon", "hexagon", "geometry"],
  params: LabeledShapeParams,
  example: { sides: 5, radius: 90, showAngle: false },
  build(p) {
    const r = p.radius;
    return { node: buildLabeledShape(p), bbox: { w: r * 2.4, h: r * 2.4 } };
  },
};
