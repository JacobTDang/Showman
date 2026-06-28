/**
 * Shared helpers for the math builders. Each builder lives in its own file and
 * composes engine primitives the same way: themed via `getTheme`, id-namespaced via
 * `idGen`, returning a `GroupNode` placed at (x, y) with children in local coords.
 * Builders are PURE functions of their options (same opts -> same spec).
 */

import { getTheme, swatch, type Theme, type Palette } from "../theme/themes.js";

export { getTheme, swatch };
export type { Theme, Palette };

/** A namespaced id generator: `idGen("frac")()` -> "frac-0", "frac-1", … */
export function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${n++}`;
}

/** Format an axis/tick number: integers as-is, else one decimal. */
export function fmtTick(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Approximate glyph advance width for laying out math notation without measuring. */
export function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}
