/**
 * Lightweight math notation — compose the engine's `text` + `polyline` primitives into
 * inline math expressions (fractions, powers, plain runs) without a LaTeX engine.
 *
 * An expression is an ordered list of {@link ExprPart}s laid out left → right with a
 * single advancing cursor. Everything sits on a shared horizontal midline (local y = 0)
 * so parts align like a typeset line. Pure function of its options (same opts → same spec).
 *
 * Ids are namespaced by an `id` prefix; pass distinct prefixes if you use two expressions
 * in one scene.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";
import { getTheme, idGen, approxTextWidth } from "./shared.js";

/**
 * One piece of an expression:
 * - `text`: a literal run drawn on the midline (e.g. `"y = "`, `"x"`).
 * - `frac`: a stacked fraction — `num` above, `den` below, divider rule between.
 * - `pow`: a `base` with a raised, smaller `exp` superscript.
 */
export type ExprPart =
  { kind: "text"; text: string } | { kind: "frac"; num: string; den: string } | { kind: "pow"; base: string; exp: string };

export interface MathExprOptions {
  id?: string;
  /** Ordered parts, rendered left → right. */
  parts: ExprPart[];
  /** Top-left placement of the expression's local origin (the start of the midline). */
  x?: number;
  y?: number;
  /** Base font size in px. Default 40. */
  fontSize?: number;
  theme?: string;
  /** Override color for glyphs + the fraction rule. Defaults to the theme's text color. */
  fill?: Color;
}

/** Build a lightweight math expression as a GroupNode of text + polyline children. */
export function buildMathExpr(opts: MathExprOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "expr";
  const nid = idGen(prefix);
  const fs = opts.fontSize ?? 40;
  const fill = opts.fill ?? theme.palette.text;
  const font = theme.bodyFont;

  // Superscript scale + the gaps that keep stacked parts off the midline.
  const supScale = 0.6;
  const fracPad = fs * 0.3; // horizontal breathing room after a fraction
  const fracRise = fs * 0.55; // vertical offset of num/den from the midline
  const supRise = fs * 0.4; // how far a superscript floats above the midline

  const children: Node[] = [];
  let cursor = 0; // advancing x along the midline (local space)

  for (const part of opts.parts) {
    if (part.kind === "text") {
      children.push({
        id: nid(),
        type: "text",
        x: cursor,
        y: 0,
        text: part.text,
        fontSize: fs,
        fontFamily: font,
        fill,
        align: "left",
        baseline: "middle",
      });
      cursor += approxTextWidth(part.text, fs);
    } else if (part.kind === "frac") {
      const numW = approxTextWidth(part.num, fs);
      const denW = approxTextWidth(part.den, fs);
      const w = Math.max(numW, denW);
      const cx = cursor + w / 2; // numerator/denominator share this center
      // numerator (above the rule)
      children.push({
        id: nid(),
        type: "text",
        x: cx,
        y: -fracRise,
        text: part.num,
        fontSize: fs,
        fontFamily: font,
        fill,
        align: "center",
        baseline: "middle",
      });
      // denominator (below the rule)
      children.push({
        id: nid(),
        type: "text",
        x: cx,
        y: fracRise,
        text: part.den,
        fontSize: fs,
        fontFamily: font,
        fill,
        align: "center",
        baseline: "middle",
      });
      // horizontal divider rule on the midline
      children.push({
        id: nid(),
        type: "polyline",
        points: [
          { x: cursor, y: 0 },
          { x: cursor + w, y: 0 },
        ],
        stroke: fill,
        strokeWidth: Math.max(1, fs * 0.05),
        lineCap: "round",
      });
      cursor += w + fracPad;
    } else {
      // pow: base on the midline, exp raised + shrunk to a superscript
      const baseW = approxTextWidth(part.base, fs);
      if (part.base.length > 0) {
        children.push({
          id: nid(),
          type: "text",
          x: cursor,
          y: 0,
          text: part.base,
          fontSize: fs,
          fontFamily: font,
          fill,
          align: "left",
          baseline: "middle",
        });
      }
      const supFs = fs * supScale;
      children.push({
        id: nid(),
        type: "text",
        x: cursor + baseW,
        y: -supRise,
        text: part.exp,
        fontSize: supFs,
        fontFamily: font,
        fill,
        align: "left",
        baseline: "middle",
      });
      cursor += baseW + approxTextWidth(part.exp, supFs);
    }
  }

  return { id: prefix, type: "group", x: opts.x ?? 0, y: opts.y ?? 0, children };
}
