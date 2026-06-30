/**
 * Multiplication array — a `rows × cols` grid of evenly spaced dots (ellipses).
 *
 * The classic "array model" for multiplication: `rows × cols` identical dots laid
 * out on a regular pitch so kids can skip-count or see the product as area. Returns
 * a GroupNode placed at (x, y) with `rows * cols` ellipse children in local coords.
 * Pure function of its options (same opts → same spec).
 */

import type { GroupNode, Node, Color } from "../spec/types.js";
import { getTheme, idGen, finiteNum, posSize, intCount } from "./shared.js";
import { chipRamp, type Depth } from "../theme/depth.js";

export interface ArrayGridOptions {
  id?: string;
  /** Top-left placement of the grid group. */
  x?: number;
  y?: number;
  /** Number of dot rows (>= 1). */
  rows: number;
  /** Number of dot columns (>= 1). */
  cols: number;
  /** Center-to-center spacing between adjacent dots, in px. Default 40. */
  gap?: number;
  /** Dot radius in px. Default 12. */
  dotRadius?: number;
  theme?: string;
  /** Dot fill color. Defaults to the theme's accent. */
  color?: Color;
  /** Dimensionality of the dots (a spherical highlight). Default "soft"; "flat" = solid fills. */
  depth?: Depth;
}

/** A `rows × cols` array of dots — the area/array model for multiplication. */
export function buildArrayGrid(opts: ArrayGridOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "array";
  const nid = idGen(prefix);
  let rows = Math.max(1, intCount(opts.rows, 1));
  let cols = Math.max(1, intCount(opts.cols, 1));
  // Cap the total dot count so the scene never blows past the renderer/validator
  // node budget (rows*cols emitted as children). Normal small grids are unaffected.
  const MAX_DOTS = 4096;
  if (rows * cols > MAX_DOTS) {
    cols = Math.max(1, Math.min(cols, Math.floor(MAX_DOTS / rows)));
    if (rows * cols > MAX_DOTS) rows = Math.max(1, Math.floor(MAX_DOTS / cols));
  }
  const gap = posSize(opts.gap, 40);
  const r = posSize(opts.dotRadius, 12);
  const fill = opts.color ?? theme.palette.accent;
  const grad = chipRamp(fill, r, opts.depth ?? "soft"); // sphere-like highlight (undefined when flat)

  const children: Node[] = [];
  // Row-major so ids run left→right, top→bottom. Each dot's center sits on a
  // regular pitch; the ellipse origin is its bounding-box top-left.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = r + col * gap;
      const cy = r + row * gap;
      children.push({
        id: nid(),
        type: "ellipse",
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        fill,
        ...(grad ? { gradient: grad } : {}),
      });
    }
  }

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
