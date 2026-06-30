/**
 * Base-ten place-value blocks — the classic manipulative for teaching place value:
 * `hundreds` "flats" (a 10×10 square), `tens` "rods" (a 1×10 column), and `ones`
 * "units" (a single 1×1 square). Blocks are laid out left → right by place value —
 * all flats, a gap, all rods, a gap, all units — bottom-aligned to a common baseline.
 *
 * Like the other math builders this is a PURE function of its options (same opts →
 * identical spec), themed via `getTheme`, id-namespaced via `idGen`, and returns a
 * GroupNode placed at (x, y) with children in local coords.
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme, idGen, posSize, intCount, finiteNum } from "./shared.js";
import { fillRamp, type Depth } from "../theme/depth.js";

export interface BaseTenBlocksOptions {
  id?: string;
  /** Top-left placement of the block layout. */
  x?: number;
  y?: number;
  /** Number of hundreds flats (10×10 unit squares). Default 0. */
  hundreds?: number;
  /** Number of tens rods (1×10 unit columns). Default 0. */
  tens?: number;
  /** Number of ones unit squares. Default 0. */
  ones?: number;
  /** Pixel size of a single unit square. Default 16. */
  unit?: number;
  theme?: string;
  /** Dimensionality of the block faces (a shaded gradient). Default "soft"; "flat" = solid. */
  depth?: Depth;
}

/**
 * Build base-ten place-value blocks. Each individual block becomes one top-level
 * group child, so `group.children.length === hundreds + tens + ones`.
 */
export function buildBaseTenBlocks(opts: BaseTenBlocksOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "baseten";
  const nid = idGen(prefix);

  const unit = posSize(opts.unit, 16);
  // Each hundreds flat expands to ~20 nodes, a tens rod ~11, a ones unit ~2; cap the
  // counts well below the scene node limit so even maxed-out inputs stay a valid spec.
  const hundreds = intCount(opts.hundreds, 0, 250);
  const tens = intCount(opts.tens, 0, 250);
  const ones = intCount(opts.ones, 0, 250);

  const fill = theme.palette.secondary; // place-value blocks share one fill
  const outline = theme.palette.text; // darker border around each block
  const gridStroke = theme.palette.bg; // thin internal grid lines
  const depth = opts.depth ?? "soft";

  const flatSide = unit * 10; // a hundreds flat spans 10 units on each side
  const baselineY = flatSide; // common baseline = bottom of the tallest block
  const gapWithin = unit * 0.5; // spacing between blocks of the same place value
  const gapBetween = unit * 1.5; // spacing between place-value groups

  const children: Node[] = [];
  let cx = 0; // running left → right cursor (local x)
  let placedAny = false;

  // A filled, outlined rect subdivided into `cols × rows` unit cells by thin grid lines.
  // Bottom-aligned to the baseline so every place value rests on the same line.
  const block = (bx: number, w: number, h: number, cols: number, rows: number): GroupNode => {
    const faceGrad = fillRamp(fill, h, depth); // a shaded face so the block reads dimensional
    const inner: Node[] = [
      {
        id: nid(),
        type: "rect",
        x: 0,
        y: 0,
        width: w,
        height: h,
        fill,
        ...(faceGrad ? { gradient: faceGrad } : {}),
        stroke: outline,
        strokeWidth: 2,
      },
    ];
    for (let c = 1; c < cols; c++) {
      inner.push({
        id: nid(),
        type: "polyline",
        points: [
          { x: c * unit, y: 0 },
          { x: c * unit, y: h },
        ],
        stroke: gridStroke,
        strokeWidth: 1,
      });
    }
    for (let r = 1; r < rows; r++) {
      inner.push({
        id: nid(),
        type: "polyline",
        points: [
          { x: 0, y: r * unit },
          { x: w, y: r * unit },
        ],
        stroke: gridStroke,
        strokeWidth: 1,
      });
    }
    return { id: nid(), type: "group", x: bx, y: baselineY - h, children: inner };
  };

  // Place `count` blocks of one place value, advancing the cursor as we go.
  const placeCategory = (count: number, w: number, h: number, cols: number, rows: number): void => {
    if (count <= 0) return;
    if (placedAny) cx += gapBetween;
    placedAny = true;
    for (let i = 0; i < count; i++) {
      if (i > 0) cx += gapWithin;
      children.push(block(cx, w, h, cols, rows));
      cx += w;
    }
  };

  placeCategory(hundreds, flatSide, flatSide, 10, 10); // flats: 10 cols × 10 rows
  placeCategory(tens, unit, flatSide, 1, 10); // rods: 1 col × 10 rows
  placeCategory(ones, unit, unit, 1, 1); // units: a single cell

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
