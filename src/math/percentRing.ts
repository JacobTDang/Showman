/**
 * Percent ring — an annular gauge: a faint full-ring "track" with a colored arc
 * filled clockwise from 12 o'clock to `percent`% of the circle, and a center
 * counter reading the number with a "%" suffix. Drawn like the other math
 * builders: themed via `getTheme`, id-namespaced via `idGen`, returning a
 * `GroupNode` placed at (x, y) with children in local coords. Pure function of
 * its options.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";
import { getTheme, idGen, clamp, finiteNum, posSize } from "./shared.js";
import { fillRamp, type Depth } from "../theme/depth.js";

// ───────────────────────── Percent ring ─────────────────────────

export interface PercentRingOptions {
  id?: string;
  /** Top-left placement of the ring's bounding box. */
  x?: number;
  y?: number;
  /** Percentage 0..100 the ring is filled to (sweep is clamped to this range). */
  percent: number;
  /** Outer radius in px. Default 80. */
  radius?: number;
  /** Ring band thickness in px (outer radius minus inner radius). Default 22. */
  thickness?: number;
  theme?: string;
  /** Fill color of the filled portion. Defaults to the theme accent. */
  fill?: Color;
  /** Dimensionality of the filled arc (a gradient sheen). Default "soft"; "flat" = solid. */
  depth?: Depth;
}

/** A percent ring: faint full track + clockwise-filled arc + center "N%" counter. */
export function buildPercentRing(opts: PercentRingOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "pctring";
  const nid = idGen(prefix);

  const radius = posSize(opts.radius, 80);
  // Keep the inner radius strictly positive so the shape always reads as a ring,
  // even when thickness is NaN/huge/>= radius.
  const thickness = posSize(opts.thickness, 22);
  const innerRadius = Math.max(1, radius - thickness);

  // Sanitize percent: a finite value drives the counter; the sweep is clamped 0..100.
  const pct = finiteNum(opts.percent, 0);
  const sweep = clamp(pct, 0, 100);
  const fill = opts.fill ?? theme.palette.accent;

  const children: Node[] = [
    // Faint full-ring track underneath.
    {
      id: nid(),
      type: "arc",
      x: 0,
      y: 0,
      radius,
      innerRadius,
      startAngle: 0,
      endAngle: 360,
      fill: theme.palette.muted,
      opacity: 0.3,
    },
    // Filled portion, clockwise from 12 o'clock — a gentle top→bottom sheen across the ring.
    {
      id: nid(),
      type: "arc",
      x: 0,
      y: 0,
      radius,
      innerRadius,
      startAngle: 0,
      endAngle: (sweep / 100) * 360,
      fill,
      ...(fillRamp(fill, radius * 2, opts.depth ?? "soft") ? { gradient: fillRamp(fill, radius * 2, opts.depth ?? "soft")! } : {}),
    },
    // Center counter: rounded percent with a "%" suffix.
    {
      id: nid(),
      type: "counter",
      x: radius,
      y: radius,
      value: Math.round(pct),
      suffix: "%",
      fontSize: radius * 0.5,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      align: "center",
      baseline: "middle",
      fill: theme.palette.text,
    },
  ];

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
