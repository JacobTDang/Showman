/**
 * Periodic table — the full 118-element grid (main block + the lanthanide/actinide f-block rows),
 * cells colored by category, with optional element highlighting. Pure builder over rect + text;
 * deterministic + golden-safe.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";
import { getTheme } from "../theme/themes.js";
import { fillRamp, type Depth } from "../theme/depth.js";
import { ELEMENTS, CATEGORY_COLOR } from "./elements.js";

export interface PeriodicTableOptions {
  id?: string;
  x: number;
  y: number;
  /** Cell size in px. Default 40. */
  cellSize?: number;
  /** Symbols to highlight (an accent ring). */
  highlight?: string[];
  /** Dim non-highlighted cells when something is highlighted. Default true. */
  dimRest?: boolean;
  theme?: string;
  /** Dimensionality of the cells (a subtle category-color gradient). Default "soft"; "flat" = solid. */
  depth?: Depth;
}

export function periodicTable(opts: PeriodicTableOptions): GroupNode {
  const id = opts.id ?? "ptable";
  const theme = getTheme(opts.theme);
  const cell = opts.cellSize ?? 40;
  const gap = Math.max(1, cell * 0.06);
  const inner = cell - gap;
  const highlight = new Set(opts.highlight ?? []);
  const hasHi = highlight.size > 0;
  const accent = theme.palette.accent;
  const depth = opts.depth ?? "soft";
  const children: Node[] = [];

  for (const el of ELEMENTS) {
    const col = el.group - 1;
    // Main grid rows 0–6; the f-block (display periods 8/9) drops below with a small gap.
    const row = el.period <= 7 ? el.period - 1 : el.period - 1 + 0.5;
    const cx = opts.x + col * cell;
    const cy = opts.y + row * cell;
    const hi = highlight.has(el.sym);
    const dim = hasHi && !hi && opts.dimRest !== false;
    const fill: Color = CATEGORY_COLOR[el.category];
    const cellGrad = fillRamp(fill, inner, depth); // a subtle shaded cell
    children.push({
      id: `${id}-c${el.z}`,
      type: "rect",
      x: cx,
      y: cy,
      width: inner,
      height: inner,
      radius: Math.max(2, cell * 0.08),
      fill,
      ...(cellGrad ? { gradient: cellGrad } : {}),
      ...(hi ? { stroke: accent, strokeWidth: 3 } : {}),
      opacity: dim ? 0.35 : 1,
    });
    children.push({
      id: `${id}-z${el.z}`,
      type: "text",
      x: cx + 4,
      y: cy + 7,
      text: String(el.z),
      fontFamily: theme.bodyFont,
      fontWeight: 500,
      fontSize: Math.round(cell * 0.2),
      fill: "#1e293b",
      align: "left",
      baseline: "middle",
      opacity: dim ? 0.45 : 1,
    });
    children.push({
      id: `${id}-s${el.z}`,
      type: "text",
      x: cx + inner / 2,
      y: cy + inner * 0.6,
      text: el.sym,
      fontFamily: theme.headingFont,
      fontWeight: 700,
      fontSize: Math.round(cell * 0.34),
      fill: "#0f172a",
      align: "center",
      baseline: "middle",
      opacity: dim ? 0.45 : 1,
    });
  }
  return { id, type: "group", x: 0, y: 0, children };
}
