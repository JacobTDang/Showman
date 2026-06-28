/**
 * Tape diagram (a.k.a. bar model) — a single horizontal bar split into labeled
 * segments whose widths are proportional to their values. Each segment is a
 * themed rect with its label/value centered inside; an optional upward-bracket
 * brace spans the whole bar with a total label above it.
 *
 * Like the other math builders this is a PURE function of its options (same opts
 * -> identical spec) and returns a GroupNode placed at (x, y) with children laid
 * out in local coords. Ids are namespaced by the `id` prefix.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";
import { getTheme, idGen, fmtTick, swatch, finiteNum, posSize, type Theme } from "./shared.js";

/** A single part of the tape: its size plus an optional label/color override. */
export interface TapeSegment {
  /** Relative magnitude — segment widths are proportional to these. */
  value: number;
  /** Text drawn centered in the segment. Defaults to the formatted value. */
  label?: string;
  /** Fill color override. Defaults to `swatch(theme, i)`. */
  color?: string;
}

export interface TapeDiagramOptions {
  id?: string;
  /** Top-left placement of the whole diagram. */
  x?: number;
  y?: number;
  /** Pixel width of the bar. Default 420. */
  width?: number;
  /** Pixel height of the bar. Default 56. */
  height?: number;
  /** The proportional parts, drawn left-to-right. */
  segments: TapeSegment[];
  theme?: string;
  /** When set, draws an upward-bracket brace above the bar with this label. */
  totalLabel?: string;
}

/**
 * A bar split into `segments.length` proportional cells (one rect each), with an
 * optional total brace above. Returns a GroupNode for `scene.nodes`.
 */
export function buildTapeDiagram(opts: TapeDiagramOptions): GroupNode {
  const theme: Theme = getTheme(opts.theme);
  const prefix = opts.id ?? "tape";
  const nid = idGen(prefix);
  const w = posSize(opts.width, 420);
  const h = posSize(opts.height, 56);
  const segments = Array.isArray(opts.segments) ? opts.segments : [];

  // Reserve vertical room above the bar for the brace + total label.
  const hasBrace = opts.totalLabel !== undefined;
  const topPad = hasBrace ? 44 : 0;

  // Sum of (finite, non-negative) values; when zero we fall back to equal widths.
  const total = segments.reduce((s, seg) => s + finiteNum(seg.value, 0, 0), 0);

  const children: Node[] = [];

  // ── Segments: one proportional rect + a centered label each ─────────────
  let cursorX = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const v = finiteNum(seg.value, 0, 0);
    const segW = total > 0 ? (v / total) * w : w / segments.length;
    const fill: Color = seg.color ?? swatch(theme, i);

    children.push({
      id: nid(),
      type: "rect",
      x: cursorX,
      y: topPad,
      width: segW,
      height: h,
      fill,
      stroke: theme.palette.bg,
      strokeWidth: 2,
    });
    children.push({
      id: nid(),
      type: "text",
      x: cursorX + segW / 2,
      y: topPad + h / 2,
      text: seg.label ?? fmtTick(seg.value),
      fontSize: 18,
      fontFamily: theme.bodyFont,
      fontWeight: 700,
      fill: "#ffffff",
      align: "center",
      baseline: "middle",
    });

    cursorX += segW;
  }

  // ── Optional total brace: an upward bracket above the bar ────────────────
  if (hasBrace) {
    const braceBottom = topPad - 8;
    const braceTop = topPad - 24;
    const peak = braceTop - 8;
    children.push({
      id: nid(),
      type: "polyline",
      points: [
        { x: 0, y: braceBottom },
        { x: 0, y: braceTop },
        { x: w / 2 - 8, y: braceTop },
        { x: w / 2, y: peak },
        { x: w / 2 + 8, y: braceTop },
        { x: w, y: braceTop },
        { x: w, y: braceBottom },
      ],
      stroke: theme.palette.text,
      strokeWidth: 3,
      lineJoin: "round",
      lineCap: "round",
    });
    children.push({
      id: nid(),
      type: "text",
      x: w / 2,
      y: peak - 6,
      text: opts.totalLabel!,
      fontSize: 18,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.text,
      align: "center",
      baseline: "bottom",
    });
  }

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
