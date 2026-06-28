/**
 * Number sentence — a horizontal "a op b = c" equation laid out left → right.
 *
 * Composes the engine primitives into a child-friendly equation: large operand
 * numbers (counter nodes) separated by a big, themed operator and an equals sign
 * (text nodes), with an optional small row of dots under each operand so young
 * learners can *count* the quantities they are combining.
 *
 * Like the other math builders this returns a GroupNode placed at (x, y) with all
 * children in local coords, ids namespaced via `idGen`, and is a PURE function of
 * its options (same opts → identical spec).
 */

import type { Node, GroupNode, Color } from "../spec/types.js";
import { getTheme, idGen, clamp, approxTextWidth, swatch, finiteNum } from "./shared.js";

/** The arithmetic operators a number sentence understands. */
export type MathOp = "+" | "-" | "×" | "÷";

/** Map each operator option to the glyph that should actually be drawn. */
const OP_GLYPH: Record<MathOp, string> = {
  "+": "+",
  "-": "−", // U+2212 MINUS SIGN — reads cleaner than a hyphen at large sizes
  "×": "×",
  "÷": "÷",
};

export interface NumberSentenceOptions {
  id?: string;
  /** Top-left placement of the sentence. */
  x?: number;
  y?: number;
  /** Left operand. */
  a: number;
  /** Operator. */
  op: MathOp;
  /** Right operand. */
  b: number;
  /** The answer shown after `=`. */
  result: number;
  theme?: string;
  /** Draw a small row of counting dots under each operand. Default true. */
  showDots?: boolean;
}

// Layout constants (local pixels). Numbers are big; operators slightly smaller.
const NUM_FONT = 64;
const OP_FONT = 56;
const GAP = 22; // horizontal space between tokens
const CENTER_Y = 44; // vertical center of the number row
const DOT_R = 6;
const DOT_GAP = 18; // center-to-center spacing of counting dots
const DOT_ROW_Y = CENTER_Y + 66; // baseline of the dot row, below the numbers
const MAX_DOTS = 10; // keep the counting row compact for large operands

/** How many counting dots to draw under an operand (clamped so the row stays small). */
function dotCount(value: number): number {
  return clamp(Math.round(value), 0, MAX_DOTS);
}

/** A token is either a number (rendered as a counter) or a symbol (rendered as text). */
interface Token {
  kind: "num" | "sym";
  /** Display string — also drives layout width. */
  text: string;
  /** Numeric value for `kind === "num"`. */
  value: number;
  font: number;
  color: Color;
  /** Counting dots to draw beneath this token (0 = none). */
  dots: number;
  /** Swatch index used to color this token's dots. */
  swatchIndex: number;
}

/**
 * Build a number sentence "a op b = c". Operands become themed counters, the
 * operator and equals sign become big primary-colored text, and (when `showDots`)
 * a row of dots sits under each operand. Returns a GroupNode for `scene.nodes`.
 */
export function buildNumberSentence(opts: NumberSentenceOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "numsent";
  const nid = idGen(prefix);
  const showDots = opts.showDots !== false;
  // Guard against an out-of-union operator so layout never reads `.length` of undefined.
  const glyph = OP_GLYPH[opts.op] ?? OP_GLYPH["+"];

  // Sanitize operand/answer numbers: a ÷ 0 from the caller yields Infinity/NaN, which
  // would make the counter `value` (and so the spec) non-finite. Clamp to finite numbers.
  const a = finiteNum(opts.a, 0);
  const b = finiteNum(opts.b, 0);
  const result = finiteNum(opts.result, 0);

  // Tokens in left → right reading order. Operands get counting dots; the answer
  // is highlighted in the accent color but carries no dots.
  const tokens: Token[] = [
    {
      kind: "num",
      text: String(a),
      value: a,
      font: NUM_FONT,
      color: theme.palette.text,
      dots: showDots ? dotCount(a) : 0,
      swatchIndex: 0,
    },
    { kind: "sym", text: glyph, value: 0, font: OP_FONT, color: theme.palette.primary, dots: 0, swatchIndex: 0 },
    {
      kind: "num",
      text: String(b),
      value: b,
      font: NUM_FONT,
      color: theme.palette.text,
      dots: showDots ? dotCount(b) : 0,
      swatchIndex: 1,
    },
    { kind: "sym", text: "=", value: 0, font: OP_FONT, color: theme.palette.primary, dots: 0, swatchIndex: 0 },
    { kind: "num", text: String(result), value: result, font: NUM_FONT, color: theme.palette.accent, dots: 0, swatchIndex: 2 },
  ];

  const children: Node[] = [];
  let cx = 0; // running left edge of the next token
  for (const tok of tokens) {
    const w = approxTextWidth(tok.text, tok.font);
    if (tok.kind === "num") {
      children.push({
        id: nid(),
        type: "counter",
        x: cx,
        y: CENTER_Y,
        value: tok.value,
        fontSize: tok.font,
        fontFamily: theme.headingFont,
        fontWeight: theme.headingWeight,
        fill: tok.color,
        align: "left",
        baseline: "middle",
      });
    } else {
      children.push({
        id: nid(),
        type: "text",
        x: cx,
        y: CENTER_Y,
        text: tok.text,
        fontSize: tok.font,
        fontFamily: theme.headingFont,
        fontWeight: theme.headingWeight,
        fill: tok.color,
        align: "left",
        baseline: "middle",
      });
    }

    // A small row of counting dots, centered under the operand.
    if (tok.dots > 0) {
      const centerX = cx + w / 2;
      const rowW = (tok.dots - 1) * DOT_GAP;
      const fill = swatch(theme, tok.swatchIndex);
      for (let i = 0; i < tok.dots; i++) {
        const dcx = centerX - rowW / 2 + i * DOT_GAP;
        children.push({
          id: nid(),
          type: "ellipse",
          x: dcx - DOT_R,
          y: DOT_ROW_Y - DOT_R,
          width: DOT_R * 2,
          height: DOT_R * 2,
          fill,
        });
      }
    }

    cx += w + GAP;
  }

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
