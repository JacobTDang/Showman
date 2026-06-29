/**
 * Slide templates — composed, themed layouts for adult/college/enterprise content, replacing
 * per-lesson magic-number positioning. Each builder returns `Node[]` placed via the layout
 * geometry + the theme's fonts/palette, with wrapped multi-line text. Set the scene background to
 * the theme's `bg`. Pure and deterministic.
 *
 * Layout is MEASURED at build time (a measuring canvas over the same pinned fonts), so wrapped
 * titles and bullets get the right vertical space — text never overlaps or marches off-frame.
 * Every emitted id is namespaced by `idPrefix` (default "slide") so multiple slides can be
 * composed into one scene by passing distinct prefixes.
 */

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import type { Node } from "../spec/types.js";
import { ensureFontsRegistered } from "../engine/fonts.js";
import { wrapText } from "../engine/textLayout.js";
import { getTheme, type Theme } from "../theme/themes.js";
import { frame, inset, type Box } from "./layout.js";

export interface SlideOptions {
  width?: number;
  height?: number;
  theme?: string | Theme;
  /** Safe-area margin in px. Default 8% of the smaller dimension. */
  margin?: number;
  /** Prefix for emitted node ids (so multiple slides can share one scene). Default "slide". */
  idPrefix?: string;
}

interface Resolved {
  theme: Theme;
  w: number;
  h: number;
  area: Box;
  prefix: string;
}

function resolve(opts: SlideOptions): Resolved {
  const theme = typeof opts.theme === "object" ? opts.theme : getTheme(opts.theme);
  const w = opts.width ?? 1280;
  const h = opts.height ?? 720;
  const margin = opts.margin ?? Math.round(Math.min(w, h) * 0.08);
  return { theme, w, h, area: inset(frame(w, h), margin), prefix: opts.idPrefix ?? "slide" };
}

// A shared measuring context (build-time only — never the render path). Lazily created over the
// pinned fonts so line counts match what the renderer will actually wrap to.
let measureCtx: SKRSContext2D | null = null;
function lineCount(text: string, family: string, weight: number, fontSize: number, maxWidth: number): number {
  if (!measureCtx) {
    ensureFontsRegistered();
    measureCtx = createCanvas(16, 16).getContext("2d");
  }
  measureCtx.font = `${weight} ${fontSize}px "${family}"`;
  return wrapText(text, maxWidth, (s) => measureCtx!.measureText(s).width).length;
}

/** A centered title slide: large heading + optional subtitle, both wrap-aware. */
export function titleSlide(opts: { title: string; subtitle?: string } & SlideOptions): Node[] {
  const { theme, area, w, h, prefix } = resolve(opts);
  const titleSize = Math.round(h * 0.1);
  const subSize = Math.round(titleSize * 0.42);
  const gap = titleSize * 0.5;

  const titleLines = lineCount(opts.title, theme.headingFont, theme.headingWeight, titleSize, area.width);
  const titleHeight = titleLines * titleSize * 1.1;
  const subLines = opts.subtitle !== undefined ? lineCount(opts.subtitle, theme.bodyFont, theme.bodyWeight, subSize, area.width * 0.8) : 0;
  const subHeight = subLines * subSize * 1.3;
  const blockHeight = titleHeight + (subLines > 0 ? gap + subHeight : 0);
  const top = area.y + Math.max(0, (area.height - blockHeight) / 2);

  const nodes: Node[] = [
    {
      id: `${prefix}-title`,
      type: "text",
      x: w / 2,
      y: top,
      text: opts.title,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fontSize: titleSize,
      fill: theme.palette.primary,
      align: "center",
      baseline: "top",
      maxWidth: area.width,
      lineHeight: 1.1,
    },
  ];
  if (opts.subtitle !== undefined) {
    nodes.push({
      id: `${prefix}-subtitle`,
      type: "text",
      x: w / 2,
      y: top + titleHeight + gap,
      text: opts.subtitle,
      fontFamily: theme.bodyFont,
      fontWeight: theme.bodyWeight,
      fontSize: subSize,
      fill: theme.palette.muted,
      align: "center",
      baseline: "top",
      maxWidth: area.width * 0.8,
      lineHeight: 1.3,
    });
  }
  return nodes;
}

/** A heading + a wrapped, staggered bullet list. Bullet heights are measured (so wrapped bullets
 * don't overlap) and the body size shrinks to keep the list inside the frame. */
export function bulletSlide(opts: { title: string; bullets: string[]; stagger?: number } & SlideOptions): Node[] {
  const { theme, area, h, prefix } = resolve(opts);
  const titleSize = Math.round(h * 0.07);
  const listArea = inset(area, { top: titleSize * 1.8 });
  const lh = 1.25;
  const labels = opts.bullets.map((b) => `•  ${b}`);

  // Lay the list out at `size`; shrink until it fits the available height.
  const planAt = (size: number): { y: number; lines: number; size: number }[] => {
    const gap = size * 0.6;
    const out: { y: number; lines: number; size: number }[] = [];
    let y = listArea.y;
    for (const label of labels) {
      const lines = lineCount(label, theme.bodyFont, theme.bodyWeight, size, listArea.width);
      out.push({ y, lines, size });
      y += lines * size * lh + gap;
    }
    return out;
  };
  let size = Math.round(h * 0.045);
  let plan = planAt(size);
  const bottom = (p: { y: number; lines: number; size: number }[]): number => {
    const last = p[p.length - 1];
    return last ? last.y + last.lines * last.size * lh : listArea.y;
  };
  while (size > 12 && bottom(plan) > listArea.y + listArea.height) {
    size -= 2;
    plan = planAt(size);
  }

  const nodes: Node[] = [
    {
      id: `${prefix}-title`,
      type: "text",
      x: area.x,
      y: area.y,
      text: opts.title,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fontSize: titleSize,
      fill: theme.palette.primary,
      align: "left",
      baseline: "top",
      maxWidth: area.width,
      lineHeight: 1.15,
    },
  ];
  const step = opts.stagger ?? 0.4;
  labels.forEach((label, i) => {
    const row = plan[i]!;
    const start = i * step;
    nodes.push({
      id: `${prefix}-bullet-${i + 1}`,
      type: "text",
      x: listArea.x,
      y: row.y,
      text: label,
      fontFamily: theme.bodyFont,
      fontWeight: theme.bodyWeight,
      fontSize: row.size,
      fill: theme.palette.text,
      align: "left",
      baseline: "top",
      maxWidth: listArea.width,
      lineHeight: lh,
      tracks: [
        {
          property: "opacity",
          keyframes: [
            { t: start, value: 0 },
            { t: start + 0.5, value: 1, easing: "easeOutQuad" },
          ],
        },
      ],
    });
  });
  return nodes;
}
