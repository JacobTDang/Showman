/**
 * Area model — a `rows` × `cols` grid of unit squares used to teach multiplication
 * as area: the first `shaded` cells are filled, a left-side label calls out the row
 * count, a top label the column count, and an area label ("rows × cols = product")
 * sits below. Built the same way as the other math builders: themed via `getTheme`,
 * id-namespaced via `idGen`, returning a `GroupNode` placed at (x, y) with children
 * in local coords. Pure function of its options.
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme, idGen, clamp, finiteNum, posSize, intCount } from "./shared.js";

// ───────────────────────── Area grid ─────────────────────────

export interface AreaGridOptions {
  id?: string;
  /** Top-left placement of the group. */
  x?: number;
  y?: number;
  /** Number of rows (cells tall). Clamped to 1..40. */
  rows: number;
  /** Number of columns (cells wide). Clamped to 1..40. */
  cols: number;
  /** Pixel size of each unit square. Default 34. */
  unit?: number;
  /** How many cells (row-major) are shaded. Default all (`rows*cols`). Clamped to 0..total. */
  shaded?: number;
  theme?: string;
}

/** An area model: a `rows`×`cols` grid of unit squares with dimension + area labels. */
export function buildAreaGrid(opts: AreaGridOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "areagrid";
  const nid = idGen(prefix);

  // intCount keeps both loop bounds finite integers, then Math.max(1, …) forces >= 1
  // (a 0×N grid would have no cells; 1e9/NaN are capped/replaced so we never hang).
  const rows = Math.max(1, intCount(opts.rows, 1, 40));
  const cols = Math.max(1, intCount(opts.cols, 1, 40));
  const total = rows * cols;
  // Default shaded = all; cap the count at `total` so a huge/NaN value can't over-fill.
  const shaded = clamp(intCount(opts.shaded, total, total), 0, total);
  const unit = posSize(opts.unit, 34);

  // Margins reserve room for the dimension labels around the grid.
  const margin = unit;
  const gridW = cols * unit;
  const gridH = rows * unit;
  const labelFont = clamp(unit * 0.6, 12, 28);

  const fill = theme.palette.accent;
  const children: Node[] = [];

  // Unit-square cells (row-major); the first `shaded` are filled.
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    children.push({
      id: nid(),
      type: "rect",
      x: margin + col * unit,
      y: margin + row * unit,
      width: unit,
      height: unit,
      fill: i < shaded ? fill : "transparent",
      stroke: theme.palette.muted,
      strokeWidth: 2,
    });
  }

  // Top dimension label — number of columns, centered above the grid.
  children.push({
    id: nid(),
    type: "text",
    x: margin + gridW / 2,
    y: margin / 2,
    text: String(cols),
    fontSize: labelFont,
    fontFamily: theme.headingFont,
    fontWeight: theme.headingWeight,
    fill: theme.palette.secondary,
    align: "center",
    baseline: "middle",
  });

  // Left dimension label — number of rows, centered to the left of the grid.
  children.push({
    id: nid(),
    type: "text",
    x: margin / 2,
    y: margin + gridH / 2,
    text: String(rows),
    fontSize: labelFont,
    fontFamily: theme.headingFont,
    fontWeight: theme.headingWeight,
    fill: theme.palette.secondary,
    align: "center",
    baseline: "middle",
  });

  // Area label below the grid: "rows × cols = product".
  children.push({
    id: nid(),
    type: "text",
    x: margin + gridW / 2,
    y: margin + gridH + labelFont,
    text: `${rows} × ${cols} = ${total}`,
    fontSize: labelFont,
    fontFamily: theme.bodyFont,
    fontWeight: theme.bodyWeight,
    fill: theme.palette.text,
    align: "center",
    baseline: "middle",
  });

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
