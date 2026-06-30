import { z } from "zod";
import { numberLine } from "../../math/builders.js";
import type { BuilderTool } from "../types.js";

const Params = z
  .object({
    from: z.number().describe("left end value"),
    to: z.number().describe("right end value"),
    step: z.number().positive().default(1).describe("tick spacing"),
    width: z.number().positive().max(7680).default(400).describe("pixel width"),
    theme: z.string().optional().describe("palette theme name"),
  })
  .refine((p) => p.from !== p.to, { message: "from and to must differ", path: ["to"] });

type NumberLineParams = z.infer<typeof Params>;

/** math.numberLine — wraps the existing numberLine builder as a node-level catalog tool. */
export const numberLineTool: BuilderTool<NumberLineParams> = {
  name: "math.numberLine",
  domain: "math",
  level: "node",
  description: "horizontal number line with evenly spaced ticks and labels",
  keywords: ["number line", "integer", "count on a line", "interval", "addition on a line", "subtraction on a line"],
  params: Params,
  example: { from: 0, to: 10, step: 1, width: 400 },
  build(p) {
    const nl = numberLine(p);
    return { node: nl.node, bbox: { w: p.width, h: 56 } };
  },
};
