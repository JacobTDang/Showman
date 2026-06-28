/**
 * Subitizing dot pattern — the "instantly recognizable" arrangements kids learn to
 * read at a glance. For 1..6 we use the canonical dice faces laid out on a 3×3 grid
 * inside a square; for 7..10 we switch to a ten-frame style 2-row grid. Every dot is
 * a themed ellipse. Like the other math builders this is a PURE function of its
 * options (same opts → identical spec) and returns a `GroupNode` placed at (x, y)
 * with children in local coords.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";
import { getTheme, idGen, clamp } from "./shared.js";

// ───────────────────────── Dot pattern (subitizing) ─────────────────────────

export interface DotPatternOptions {
  id?: string;
  /** How many dots to show (1..10). Values outside the range are clamped. */
  n: number;
  /** Top-left placement of the square the dots live in. */
  x?: number;
  y?: number;
  /** Side length of the (square) layout box in px. Default 120. */
  size?: number;
  theme?: string;
  /** Dot fill. Default `theme.palette.primary`. */
  color?: Color;
}

/** A dot center expressed as a fraction (0..1) of the layout box, then resolved to px. */
function dotPositions(n: number, size: number): { cx: number; cy: number }[] {
  const at = (fx: number, fy: number) => ({ cx: fx * size, cy: fy * size });

  if (n <= 6) {
    // Canonical dice faces on a 3×3 grid (L = left/top, M = middle, R = right/bottom).
    const L = 0.25;
    const M = 0.5;
    const R = 0.75;
    switch (n) {
      case 1:
        return [at(M, M)];
      case 2:
        return [at(L, L), at(R, R)];
      case 3:
        return [at(L, L), at(M, M), at(R, R)];
      case 4:
        return [at(L, L), at(R, L), at(L, R), at(R, R)];
      case 5:
        return [at(L, L), at(R, L), at(M, M), at(L, R), at(R, R)];
      default: // 6: two columns of three
        return [at(L, L), at(R, L), at(L, M), at(R, M), at(L, R), at(R, R)];
    }
  }

  // 7..10: ten-frame style — 2 rows × 5 columns, filled left-to-right, top row first.
  const cols = 5;
  const topRowY = 0.32;
  const bottomRowY = 0.68;
  const out: { cx: number; cy: number }[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out.push(at((col + 0.5) / cols, row === 0 ? topRowY : bottomRowY));
  }
  return out;
}

/**
 * A subitizing dot pattern: exactly `n` themed dot ellipses arranged as a dice face
 * (1..6) or a ten-frame grid (7..10), centered inside a `size`×`size` box.
 */
export function buildDotPattern(opts: DotPatternOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "dots";
  const nid = idGen(prefix);
  const size = opts.size ?? 120;
  const n = clamp(Math.round(opts.n), 1, 10);
  const color = opts.color ?? theme.palette.primary;

  // Dice grids breathe more than the denser ten-frame, so scale the dot accordingly.
  const dotR = (n <= 6 ? 0.11 : 0.085) * size;

  const children: Node[] = dotPositions(n, size).map((p) => ({
    id: nid(),
    type: "ellipse",
    x: p.cx - dotR,
    y: p.cy - dotR,
    width: dotR * 2,
    height: dotR * 2,
    fill: color,
  }));

  return { id: prefix, type: "group", x: opts.x ?? 0, y: opts.y ?? 0, children };
}
