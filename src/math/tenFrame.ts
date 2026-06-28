/**
 * Ten-frame — a classic early-numeracy manipulative: a 2-row × 5-column grid of
 * square cells where the first `filled` cells each hold a round counter (a token).
 * Children draw it the same way the other math builders compose primitives: themed
 * via `getTheme`, id-namespaced via `idGen`, returning a `GroupNode` placed at
 * (x, y) with children in local coords. Pure function of its options.
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme, idGen, clamp, finiteNum, posSize, intCount } from "./shared.js";

// ───────────────────────── Ten-frame ─────────────────────────

export interface TenFrameOptions {
  id?: string;
  /** Top-left placement of the grid. */
  x?: number;
  y?: number;
  /** Number of cells filled with a counter (clamped to 0..total). */
  filled: number;
  /** Total number of cells. Default 10 (a true ten-frame). */
  total?: number;
  /** Pixel size of each square cell. Default 48. */
  cellSize?: number;
  theme?: string;
}

/** A ten-frame: `total` square cells in rows of 5, the first `filled` holding a counter. */
export function buildTenFrame(opts: TenFrameOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "tenframe";
  const nid = idGen(prefix);
  const cols = 5;
  const total = intCount(opts.total, 10);
  const filled = clamp(intCount(opts.filled, 0), 0, total);
  const cell = posSize(opts.cellSize, 48);
  // Counter radius — comfortably fills the cell so its center reads as `primary`.
  const r = cell * 0.32;

  const children: Node[] = [];
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = col * cell;
    const cellY = row * cell;
    // Cell outline.
    children.push({
      id: nid(),
      type: "rect",
      x: cellX,
      y: cellY,
      width: cell,
      height: cell,
      fill: "transparent",
      stroke: theme.palette.muted,
      strokeWidth: 2,
    });
    // Round counter centered in the cell, for the first `filled` cells.
    if (i < filled) {
      const cx = cellX + cell / 2;
      const cy = cellY + cell / 2;
      children.push({
        id: nid(),
        type: "ellipse",
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        fill: theme.palette.primary,
      });
    }
  }

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
