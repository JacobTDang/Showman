import { z } from "zod";
import { buildBalanceScale } from "../../math/balanceScale.js";
import { buildMathExpr, type ExprPart } from "../../math/mathExpr.js";
import type { BuilderTool } from "../types.js";

/** math.balanceScale — a tilting beam scale for equations/comparisons. */
const BalanceScaleParams = z.object({
  left: z.number().describe("weight on the left pan"),
  right: z.number().describe("weight on the right pan"),
  leftLabel: z.string().optional(),
  rightLabel: z.string().optional(),
  width: z.number().positive().max(800).default(320),
  theme: z.string().optional(),
});
type BalanceScaleParams = z.infer<typeof BalanceScaleParams>;

export const balanceScaleTool: BuilderTool<BalanceScaleParams> = {
  name: "math.balanceScale",
  domain: "math",
  level: "node",
  description: "a balance scale that tilts toward the heavier side — solving equations, comparisons",
  keywords: ["balance", "scale", "equation", "solve", "unknown", "variable", "equal", "compare", "weigh"],
  params: BalanceScaleParams,
  example: { left: 5, right: 5, leftLabel: "3x", rightLabel: "15", width: 320 },
  build(p) {
    return { node: buildBalanceScale(p), bbox: { w: p.width, h: p.width * 0.6 } };
  },
};

/** math.mathExpr — a lightweight math expression: runs of text / fractions / powers. */
const ExprPartSchema = z.union([
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("frac"), num: z.string(), den: z.string() }),
  z.object({ kind: z.literal("pow"), base: z.string(), exp: z.string() }),
]);
const MathExprParams = z.object({
  parts: z.array(ExprPartSchema).min(1).max(12).describe('e.g. [{"kind":"text","text":"x"},{"kind":"pow","base":"x","exp":"2"}]'),
  fontSize: z.number().positive().max(120).default(40),
});
type MathExprParams = z.infer<typeof MathExprParams>;

export const mathExprTool: BuilderTool<MathExprParams> = {
  name: "math.mathExpr",
  domain: "math",
  level: "node",
  description: "a lightweight typeset math expression: text runs, stacked fractions, and powers (no LaTeX)",
  keywords: ["expression", "formula", "fraction", "exponent", "power", "equation", "notation"],
  params: MathExprParams,
  example: {
    parts: [
      { kind: "text", text: "x " },
      { kind: "pow", base: "", exp: "2" },
      { kind: "text", text: " + 1" },
    ],
    fontSize: 40,
  },
  build(p) {
    const width = p.parts.reduce((w, part) => {
      if (part.kind === "text") return w + part.text.length * p.fontSize * 0.6;
      if (part.kind === "pow") return w + (part.base.length + part.exp.length) * p.fontSize * 0.45;
      return w + Math.max(part.num.length, part.den.length) * p.fontSize * 0.5;
    }, 0);
    return {
      node: buildMathExpr({ parts: p.parts as ExprPart[], fontSize: p.fontSize }),
      bbox: { w: Math.max(80, width), h: p.fontSize * 2.2 },
    };
  },
};
