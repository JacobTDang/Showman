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

// ── Input sanitizers ─────────────────────────────────────────────────────────
// Builders must never emit non-finite or negative dimensions (an invalid spec, or
// — if validation is skipped — a native renderer panic), and must never loop over an
// unbounded/zero/NaN count or step (a hang). These coerce option values to safe ranges.

/** A finite number clamped to [min, max]; falls back when non-finite. `??` does NOT catch NaN/Infinity. */
export function finiteNum(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** A finite, strictly-positive size in [min, max] (for widths, radii, font/cell/unit sizes). */
export function posSize(v: unknown, fallback: number, min = 1, max = 100000): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(max, Math.max(min, v)) : fallback;
}

/** A finite, non-negative integer count, capped to avoid infinite loops / OOM. */
export function intCount(v: unknown, fallback: number, max = 1000): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback;
  return Math.min(max, Math.max(0, n));
}
