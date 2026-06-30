/**
 * Depth & dimensionality — a small, golden-safe styling layer that lifts the flat builders out of
 * "corporate clip-art" territory. Everything here is byte-deterministic cross-platform:
 *
 *   - **Gradients** (linear fill ramps, radial chip highlights) — Skia gradients, proven stable.
 *   - **Crisp drop shadows** (`blur: 0` + a small offset) — a sticker-style lift, no `ctx` blur.
 *   - **Glow halos** drawn as an extra radial-gradient ellipse *node* — NOT `shadowBlur`.
 *
 * Real Gaussian blur (`shadow.blur > 0`) is the one feature whose cross-platform byte-identity is
 * unproven, so it is reserved for `depth: "rich"` and must never appear in a golden scene. The
 * default `"soft"` look uses only the safe primitives above, so builders can adopt it freely and
 * their golden frames simply re-bless once.
 */

import type { Color, LinearGradient, RadialGradient, Shadow, Node } from "../spec/types.js";
import { lighten, withAlpha } from "../engine/color.js";

/** How much dimensionality to render. `flat` = the old solid-fill look (helpers return undefined). */
export type Depth = "flat" | "soft" | "rich";

/** The default level when a builder/theme doesn't specify one. */
export const DEFAULT_DEPTH: Depth = "soft";

/**
 * A vertical fill ramp (lighter top → base) for rectangles/bars — the bread-and-butter dimensional
 * fill. Spans `[0, h]` in the node's local coordinates. Returns `undefined` for `flat` so callers
 * fall back to a solid `fill`. Deterministic.
 */
export function fillRamp(base: Color, h: number, depth: Depth = DEFAULT_DEPTH): LinearGradient | undefined {
  if (depth === "flat" || h <= 0) return undefined;
  const top = depth === "rich" ? 0.24 : 0.15;
  return {
    type: "linear",
    from: { x: 0, y: 0 },
    to: { x: 0, y: h },
    stops: [
      { offset: 0, color: lighten(base, top) },
      { offset: 1, color: base },
    ],
  };
}

/**
 * A radial highlight for round things (counting dots, chips, beads): a light hotspot toward the
 * upper-left fading to the base color, so a circle reads as a sphere. `r` is the circle radius and
 * the gradient is expressed in the node's local box `[0, 2r]`. Deterministic.
 */
export function chipRamp(base: Color, r: number, depth: Depth = DEFAULT_DEPTH): RadialGradient | undefined {
  if (depth === "flat" || r <= 0) return undefined;
  const hi = depth === "rich" ? 0.4 : 0.26;
  return {
    type: "radial",
    center: { x: r, y: r },
    radius: r * 1.2,
    innerCenter: { x: r * 0.68, y: r * 0.62 }, // hotspot sits up-and-left, like a top light
    innerRadius: 0,
    stops: [
      { offset: 0, color: lighten(base, hi) },
      { offset: 1, color: base },
    ],
  };
}

/**
 * A subtle elevation as a **crisp** (`blur: 0`) offset shadow — a sticker-style lift that stays
 * byte-identical cross-platform. Returns `undefined` for `flat`. Use `rich` for a slightly deeper
 * drop. (For a genuinely soft Gaussian shadow, see {@link softShadow} — golden-unsafe.)
 */
export function elevation(depth: Depth = DEFAULT_DEPTH): Shadow | undefined {
  if (depth === "flat") return undefined;
  return { color: "rgba(15,23,42,0.20)", blur: 0, offsetX: 0, offsetY: depth === "rich" ? 3 : 2 };
}

/**
 * A genuinely soft (Gaussian) drop shadow. **Golden-unsafe** — only emit this when not rendering a
 * golden/CI frame (it relies on `ctx` blur). Returns `undefined` unless `depth === "rich"`.
 */
export function softShadow(depth: Depth = DEFAULT_DEPTH): Shadow | undefined {
  if (depth !== "rich") return undefined;
  return { color: "rgba(15,23,42,0.28)", blur: 8, offsetX: 0, offsetY: 3 };
}

/**
 * A glow **halo node** — an ellipse filled with a radial gradient that fades the color out to
 * transparent. This is the golden-safe way to make something look like it's emitting light
 * (counters, the "correct" answer, a hot flame), as opposed to a `shadowBlur` glow. Place it
 * *behind* the thing it lights. `r` is the lit radius; the halo extends to ~`1.9r`. Deterministic.
 */
export function glowNode(id: string, cx: number, cy: number, r: number, color: Color, depth: Depth = DEFAULT_DEPTH): Node | undefined {
  if (depth === "flat" || r <= 0) return undefined;
  const reach = r * (depth === "rich" ? 2.2 : 1.9);
  const peak = depth === "rich" ? 0.5 : 0.36;
  return {
    id,
    type: "ellipse",
    x: cx - reach,
    y: cy - reach,
    width: reach * 2,
    height: reach * 2,
    gradient: {
      type: "radial",
      center: { x: reach, y: reach },
      radius: reach,
      innerRadius: 0,
      stops: [
        { offset: 0, color: withAlpha(color, peak) },
        { offset: 0.55, color: withAlpha(color, peak * 0.4) },
        { offset: 1, color: withAlpha(color, 0) },
      ],
    },
  };
}

/**
 * A soft background ramp for a whole scene/card, derived from a base color: a gentle top→bottom
 * gradient (slightly lighter top). For `flat`, returns the base color unchanged. Deterministic.
 */
export function surfaceFill(base: Color, h: number, depth: Depth = DEFAULT_DEPTH): LinearGradient | Color {
  if (depth === "flat" || h <= 0) return base;
  return {
    type: "linear",
    from: { x: 0, y: 0 },
    to: { x: 0, y: h },
    stops: [
      { offset: 0, color: lighten(base, depth === "rich" ? 0.06 : 0.04) },
      { offset: 1, color: base },
    ],
  };
}
