import { z } from "zod";
import { coordinatePlane, plotFunction, plotLine, plotPoints } from "../../math/builders.js";
import type { GroupNode, Node } from "../../spec/types.js";
import type { BuilderTool } from "../types.js";

/**
 * math.functionGraph — the headline algebra visual as ONE placement: a coordinate
 * plane with a line, a curve, or plotted points on it. Composes coordinatePlane +
 * plotFunction/plotLine/plotPoints via the internal `Plane` handle (originX/originY +
 * toLocal), which the catalog does not expose — only the combined node ships out.
 */

const Params = z
  .object({
    kind: z.enum(["linear", "quadratic", "points"]).default("linear").describe("what to plot"),
    m: z.number().optional().describe("linear: slope"),
    b: z.number().optional().describe("linear: y-intercept; quadratic: x coefficient"),
    a: z.number().optional().describe("quadratic: x^2 coefficient"),
    c: z.number().optional().describe("quadratic: constant term"),
    points: z
      .array(z.object({ x: z.number(), y: z.number(), label: z.string().optional() }))
      .max(20)
      .optional()
      .describe("kind:points"),
    xMin: z.number().default(-10),
    xMax: z.number().default(10),
    yMin: z.number().default(-10),
    yMax: z.number().default(10),
    width: z.number().positive().max(1200).default(400),
    height: z.number().positive().max(1200).default(320),
    theme: z.string().optional(),
  })
  .refine((p) => p.xMax > p.xMin && p.yMax > p.yMin, { message: "xMax/yMax must exceed xMin/yMin", path: ["xMax"] })
  .refine((p) => p.kind !== "points" || (p.points && p.points.length > 0), {
    message: "kind:points requires a non-empty points array",
    path: ["points"],
  });

type FunctionGraphParams = z.infer<typeof Params>;

export const functionGraphTool: BuilderTool<FunctionGraphParams> = {
  name: "math.functionGraph",
  domain: "math",
  level: "node",
  description: "a coordinate plane with a line (y=mx+b), a parabola (y=ax^2+bx+c), or plotted points",
  keywords: [
    "graph",
    "plot",
    "coordinate plane",
    "y = mx + b",
    "line",
    "slope",
    "parabola",
    "quadratic",
    "y = ax^2",
    "function",
    "curve",
    "points",
    "scatter",
  ],
  params: Params,
  example: { kind: "linear", m: 2, b: 1, xMin: -10, xMax: 10, yMin: -10, yMax: 10, width: 400, height: 320 },
  build(p) {
    const plane = coordinatePlane({
      width: p.width,
      height: p.height,
      xMin: p.xMin,
      xMax: p.xMax,
      yMin: p.yMin,
      yMax: p.yMax,
      ...(p.theme ? { theme: p.theme } : {}),
    });

    const extra: Node[] = [];
    if (p.kind === "linear") {
      extra.push(plotLine(plane, { m: p.m ?? 1, b: p.b ?? 0 }));
    } else if (p.kind === "quadratic") {
      const a = p.a ?? 1;
      const b = p.b ?? 0;
      const c = p.c ?? 0;
      extra.push(plotFunction(plane, (x) => a * x * x + b * x + c, {}, { id: `${plane.idPrefix}-quad` }));
    } else {
      extra.push(...plotPoints(plane, p.points ?? []));
    }

    const node: GroupNode = { id: "function-graph", type: "group", x: 0, y: 0, children: [plane.node, ...extra] };
    return { node, bbox: { w: p.width, h: p.height } };
  },
};
