/**
 * Data table — rows × columns with a header, per-column alignment, zebra striping, and borders.
 * Column widths are MEASURED at build time over the pinned fonts (like the slide templates), so
 * cells fit their content. Adult/college staple: comparison tables, truth tables, spec sheets.
 * Pure; composes rect + text + polyline.
 */

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import type { Node, GroupNode, Color } from "../spec/types.js";
import { ensureFontsRegistered } from "../engine/fonts.js";

export type CellAlign = "left" | "center" | "right";

export interface TableOptions {
  /** Node id (and the prefix for child ids). Defaults to "table" — pass distinct ids when composing
   * several builders into one scene so their child ids don't collide. */
  id?: string;
  x: number;
  y: number;
  rows: string[][];
  /** Treat the first row as a header. Default true. */
  headerRow?: boolean;
  columnAlign?: CellAlign[];
  /** Force a total width (columns scale to fit); otherwise sized from content. */
  width?: number;
  fontFamily?: string;
  fontSize?: number;
  cellPadding?: number;
  rowHeight?: number;
  headerFill?: Color;
  headerColor?: Color;
  /** Two alternating row fills, or false for none. */
  zebra?: [Color, Color] | false;
  textColor?: Color;
  border?: Color;
  borderWidth?: number;
}

export interface Table {
  node: GroupNode;
  width: number;
  height: number;
}

let measureCtx: SKRSContext2D | null = null;
function textWidth(text: string, font: string): number {
  if (!measureCtx) {
    ensureFontsRegistered();
    measureCtx = createCanvas(16, 16).getContext("2d");
  }
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

export function table(opts: TableOptions): Table {
  const id = opts.id ?? "table";
  const rows = opts.rows;
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const fontSize = opts.fontSize ?? 16;
  const family = opts.fontFamily ?? "Inter";
  const pad = opts.cellPadding ?? 12;
  const rowH = opts.rowHeight ?? Math.round(fontSize * 2.1);
  const headerRow = opts.headerRow ?? true;
  const align = opts.columnAlign ?? [];
  const border = opts.border ?? "#cbd5e1";
  const borderWidth = opts.borderWidth ?? 1;
  const zebra = opts.zebra === undefined ? (["#ffffff", "#f1f5f9"] as [Color, Color]) : opts.zebra;
  const font = (weight: number): string => `${weight} ${fontSize}px "${family}"`;

  // Measure natural column widths from content (header bold), then optionally scale to a target width.
  const colW: number[] = [];
  for (let c = 0; c < cols; c++) {
    let w = 0;
    for (let r = 0; r < rows.length; r++) {
      const weight = headerRow && r === 0 ? 700 : 400;
      w = Math.max(w, textWidth(rows[r]?.[c] ?? "", font(weight)));
    }
    colW.push(w + pad * 2);
  }
  let total = colW.reduce((a, b) => a + b, 0);
  if (opts.width !== undefined && total > 0) {
    const scale = opts.width / total;
    for (let c = 0; c < cols; c++) colW[c] = colW[c]! * scale;
    total = opts.width;
  }
  const colX: number[] = [opts.x];
  for (let c = 0; c < cols; c++) colX.push(colX[c]! + colW[c]!);
  const height = rows.length * rowH;

  const children: Node[] = [];
  // Row backgrounds.
  rows.forEach((_, r) => {
    const y = opts.y + r * rowH;
    const fill = headerRow && r === 0 ? (opts.headerFill ?? "#1e293b") : zebra ? zebra[r % 2] : undefined;
    if (fill !== undefined) children.push({ id: `${id}-rowbg-${r}`, type: "rect", x: opts.x, y, width: total, height: rowH, fill });
  });
  // Cell text.
  rows.forEach((row, r) => {
    const isHeader = headerRow && r === 0;
    const cy = opts.y + r * rowH + rowH / 2;
    for (let c = 0; c < cols; c++) {
      const text = row[c] ?? "";
      if (text === "") continue;
      const a = align[c] ?? "left";
      const x = a === "center" ? colX[c]! + colW[c]! / 2 : a === "right" ? colX[c + 1]! - pad : colX[c]! + pad;
      children.push({
        id: `${id}-cell-${r}-${c}`,
        type: "text",
        x,
        y: cy,
        text,
        fontFamily: family,
        fontWeight: isHeader ? 700 : 400,
        fontSize,
        fill: isHeader ? (opts.headerColor ?? "#f8fafc") : (opts.textColor ?? "#1e293b"),
        align: a,
        baseline: "middle",
      });
    }
  });
  // Grid lines.
  if (borderWidth > 0) {
    for (let r = 0; r <= rows.length; r++) {
      const y = opts.y + r * rowH;
      children.push({
        id: `${id}-h-${r}`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: opts.x, y },
          { x: opts.x + total, y },
        ],
        stroke: border,
        strokeWidth: borderWidth,
      });
    }
    for (let c = 0; c <= cols; c++) {
      children.push({
        id: `${id}-v-${c}`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: colX[c]!, y: opts.y },
          { x: colX[c]!, y: opts.y + height },
        ],
        stroke: border,
        strokeWidth: borderWidth,
      });
    }
  }

  // A forced width is honored even when there's no measurable content (empty rows).
  return { node: { id, type: "group", x: 0, y: 0, children }, width: opts.width ?? total, height };
}
