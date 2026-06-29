/**
 * Categorical series palette — a curated, theme-aware set of colors so multi-series charts read
 * cleanly. Falls back to the active theme's swatches.
 */

import type { Color } from "../spec/types.js";
import { getTheme, swatch } from "../theme/themes.js";

/** The i-th series color for a theme (cycles). */
export function seriesColor(theme: string | undefined, i: number): Color {
  return swatch(getTheme(theme), i);
}

/** `n` series colors for a theme. */
export function seriesColors(theme: string | undefined, n: number): Color[] {
  const t = getTheme(theme);
  return Array.from({ length: Math.max(0, n) }, (_, i) => swatch(t, i));
}
