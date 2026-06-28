/**
 * Math-brief parser — recognizes math intents in a plain-English brief and maps them
 * to a {@link MathTopic} + params for `buildMathLesson`, deterministically and with no
 * LLM. Covers the common asks: "graph y = 2x + 1", "show 3/4 as a pie",
 * "add 2 + 3 on a number line", "multiply 3 × 4", "place value of 123", a parabola,
 * an equation/balance, and a bar graph. Returns null when no math intent is found.
 */

import { THEMES } from "../theme/themes.js";
import type { MathTopic, MathLessonOptions } from "../math/lessons.js";

export interface MathBriefResult {
  topic: MathTopic;
  params: MathLessonOptions;
}

function pickTheme(b: string): string {
  const t = /ocean|sea|under\s*water|fish|wave/.test(b)
    ? "ocean"
    : /forest|meadow|tree|garden|nature|leaf/.test(b)
      ? "meadow"
      : /berry|pink|magic|fairy|princess|unicorn/.test(b)
        ? "berry"
        : "sunshine";
  return THEMES[t] ? t : "sunshine";
}

/** Parse a coefficient token: "" -> 1, "-" -> -1, else the number. */
function coeff(token: string | undefined): number {
  if (token === undefined || token === "") return 1;
  if (token === "-") return -1;
  const v = parseFloat(token);
  return Number.isFinite(v) ? v : 1;
}

/** Parse a signed trailing term like "+ 3" / "- 2.5". */
function signedTerm(token: string | undefined): number {
  if (!token) return 0;
  const v = parseFloat(token.replace(/\s+/g, ""));
  return Number.isFinite(v) ? v : 0;
}

export function parseMathBrief(brief: string): MathBriefResult | null {
  const b = brief.toLowerCase();
  const theme = pickTheme(b);

  // Quadratic / parabola (check before linear, since both contain "x").
  if (/parabola|quadratic|x\s*\^?\s*2|x²/.test(b)) {
    const a = coeff(b.match(/y\s*=\s*(-?\d*\.?\d*)\s*x\s*(?:\^?\s*2|²)/)?.[1]);
    const c = signedTerm(b.match(/x\s*(?:\^?\s*2|²)\s*(?:[+-]\s*\d*\.?\d*\s*x)?\s*([+-]\s*\d+\.?\d*)/)?.[1]) || -3;
    return { topic: "quadratic", params: { a, b: 0, c, theme } };
  }

  // Fraction: n/d, framed as a pie/fraction/out-of.
  const frac = b.match(/(\d+)\s*\/\s*(\d+)/);
  if (frac && /pie|fraction|slice|pizza|out of|\//.test(b)) {
    return { topic: "fraction", params: { numerator: parseInt(frac[1]!, 10), denominator: parseInt(frac[2]!, 10), theme } };
  }

  // Linear graph: y = m x + b.
  const lin = b.match(/y\s*=\s*(-?\d*\.?\d*)\s*x\s*([+-]\s*\d+\.?\d*)?/);
  if (lin && /graph|plot|line|y\s*=/.test(b)) {
    return { topic: "graphing", params: { m: coeff(lin[1]), b: signedTerm(lin[2]), theme } };
  }

  // Multiplication: r × c / r times c / array.
  const mul = b.match(/(\d+)\s*(?:×|x|\*|times|by)\s*(\d+)/);
  if (mul && /multiply|times|×|\barray\b|product|\*/.test(b)) {
    return { topic: "multiplication", params: { rows: parseInt(mul[1]!, 10), cols: parseInt(mul[2]!, 10), theme } };
  }

  // Addition: a + b / a plus b (often "on a number line").
  const add = b.match(/(\d+)\s*(?:\+|plus)\s*(\d+)/);
  if (add && /add|plus|\+|sum|number\s*line/.test(b)) {
    return { topic: "addition", params: { a: parseInt(add[1]!, 10), b: parseInt(add[2]!, 10), theme } };
  }

  // Place value of a (up to 3-digit) number.
  const pv = b.match(/place\s*value(?:\s*of)?\s*(\d{1,3})|base[-\s]*ten\s*(\d{1,3})/);
  if (pv) {
    const n = parseInt(pv[1] ?? pv[2] ?? "123", 10);
    return { topic: "place-value", params: { hundreds: Math.floor(n / 100) % 10, tens: Math.floor(n / 10) % 10, ones: n % 10, theme } };
  }

  // Equation / balance scale.
  if (/equation|balance|solve for|both sides/.test(b)) {
    const eq = b.match(/(\d+)\s*\+\s*(\d+)/);
    return { topic: "equation", params: { a: eq ? parseInt(eq[1]!, 10) : 2, b: eq ? parseInt(eq[2]!, 10) : 3, theme } };
  }

  // Bar graph / data.
  if (/bar\s*graph|bar\s*chart|\bdata\b|pictograph/.test(b)) {
    return { topic: "data", params: { theme } };
  }

  return null;
}
