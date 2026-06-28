/**
 * Pictograph — a picture graph: one row per category, each with a left-aligned
 * label and a run of repeated icons (a small star) standing for its count. When
 * one icon represents more than a single item, a "key" line spells out the scale
 * ("each = N"). Rows are colored by `swatch` so categories read apart at a glance.
 * Composed the same way the other math builders are: themed via `getTheme`,
 * id-namespaced via `idGen`, returning a `GroupNode` placed at (x, y) with children
 * in local coords. Pure function of its options.
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme, swatch, idGen, approxTextWidth, fmtTick, finiteNum, posSize, intCount } from "./shared.js";

// ───────────────────────── Pictograph ─────────────────────────

export interface PictographRow {
  /** Category label drawn at the left of the row. */
  label: string;
  /** Raw count for the category; icons drawn = ceil(count / unit). */
  count: number;
}

export interface PictographOptions {
  id?: string;
  /** One row per category. */
  rows: PictographRow[];
  /** Top-left placement of the chart. */
  x?: number;
  y?: number;
  /** Pixel size (bounding box) of each icon. Default 28. */
  iconSize?: number;
  /** How many items one icon stands for. Default 1. A key is drawn when > 1. */
  unit?: number;
  /** Spacing between icons and around the label column / key. Default 8. */
  gap?: number;
  theme?: string;
}

/**
 * A pictograph: for each row, a label then `ceil(count / unit)` star icons drawn
 * left-to-right and tinted by the row's swatch, plus an "each = N" key when unit > 1.
 */
export function buildPictograph(opts: PictographOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "pictograph";
  const nid = idGen(prefix);

  const iconSize = posSize(opts.iconSize, 28);
  // unit is forced finite and >= 1 so it can never blow up the per-row icon count
  // (ceil(count/unit)) or divide by zero, and reads sensibly as a "each = N" scale.
  const unit = posSize(opts.unit, 1);
  // gap may legitimately be 0, but must stay finite and non-negative.
  const gap = finiteNum(opts.gap, 8, 0, 100000);

  // Tolerate a missing / non-array `rows`, and cap the row count so a pathological
  // input can't OOM. Each row's count is sanitized to a bounded non-negative integer.
  const rawRows = Array.isArray(opts.rows) ? opts.rows : [];
  const maxRows = 1000;
  const rows = rawRows.slice(0, maxRows).map((r) => {
    const label = r && typeof r.label === "string" ? r.label : "";
    const count = intCount(r ? r.count : 0, 0);
    return { label, count };
  });

  const radius = iconSize / 2;
  const innerRadius = radius * 0.45;
  const iconStep = iconSize + gap;
  const rowH = iconSize + gap;
  const labelFont = Math.max(10, iconSize * 0.6);

  // Label column width — the widest label, so every row's icons start aligned.
  let labelWidth = 0;
  for (const r of rows) {
    if (r.label.length > 0) labelWidth = Math.max(labelWidth, approxTextWidth(r.label, labelFont));
  }
  const iconsStartX = labelWidth > 0 ? labelWidth + gap : 0;

  const children: Node[] = [];

  rows.forEach((row, i) => {
    const rowY = i * rowH;
    const centerY = rowY + iconSize / 2;

    // Left-aligned label (only when non-empty — an empty text node is invalid).
    if (row.label.length > 0) {
      children.push({
        id: nid(),
        type: "text",
        x: 0,
        y: centerY,
        text: row.label,
        fontSize: labelFont,
        fontFamily: theme.bodyFont,
        fontWeight: theme.bodyWeight,
        fill: theme.palette.text,
        align: "left",
        baseline: "middle",
      });
    }

    // ceil(count / unit) star icons, left-to-right, tinted by the row's swatch.
    const iconCount = Math.ceil(row.count / unit);
    const fill = swatch(theme, i);
    for (let j = 0; j < iconCount; j++) {
      children.push({
        id: nid(),
        type: "polygon",
        x: iconsStartX + j * iconStep,
        y: rowY,
        sides: 5,
        radius,
        innerRadius,
        fill,
      });
    }
  });

  // A "key" explaining the scale, when one icon represents more than one item.
  if (unit > 1) {
    children.push({
      id: nid(),
      type: "text",
      x: 0,
      y: rows.length * rowH + gap,
      text: `each = ${fmtTick(unit)}`,
      fontSize: labelFont,
      fontFamily: theme.bodyFont,
      fontWeight: theme.bodyWeight,
      fill: theme.palette.muted,
      align: "left",
      baseline: "top",
    });
  }

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
