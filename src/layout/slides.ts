/**
 * Slide templates — composed, themed layouts for adult/college/enterprise content, replacing
 * per-lesson magic-number positioning. Each builder returns `Node[]` placed via the layout
 * geometry + the theme's fonts/palette, with wrapped multi-line text. Set the scene background to
 * the theme's `bg`. Pure and deterministic.
 */

import type { Node } from "../spec/types.js";
import { getTheme, type Theme } from "../theme/themes.js";
import { frame, inset, column, center, type Box } from "./layout.js";

export interface SlideOptions {
  width?: number;
  height?: number;
  theme?: string | Theme;
  /** Safe-area margin in px. Default 8% of the smaller dimension. */
  margin?: number;
}

function resolve(opts: SlideOptions): { theme: Theme; w: number; h: number; area: Box } {
  const theme = typeof opts.theme === "object" ? opts.theme : getTheme(opts.theme);
  const w = opts.width ?? 1280;
  const h = opts.height ?? 720;
  const margin = opts.margin ?? Math.round(Math.min(w, h) * 0.08);
  return { theme, w, h, area: inset(frame(w, h), margin) };
}

function heading(theme: Theme, box: Box, text: string, size: number): Node {
  return {
    id: "slide-title",
    type: "text",
    x: box.x,
    y: box.y,
    text,
    fontFamily: theme.headingFont,
    fontWeight: theme.headingWeight,
    fontSize: size,
    fill: theme.palette.primary,
    align: "left",
    baseline: "top",
    maxWidth: box.width,
    lineHeight: 1.15,
  };
}

/** A centered title slide: large heading + optional subtitle. */
export function titleSlide(opts: { title: string; subtitle?: string } & SlideOptions): Node[] {
  const { theme, area, w, h } = resolve(opts);
  const block = center(area, area.width, Math.min(area.height, h * 0.4));
  const titleSize = Math.round(h * 0.1);
  const nodes: Node[] = [
    {
      id: "slide-title",
      type: "text",
      x: w / 2,
      y: block.y,
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
      id: "slide-subtitle",
      type: "text",
      x: w / 2,
      y: block.y + titleSize * 1.5,
      text: opts.subtitle,
      fontFamily: theme.bodyFont,
      fontWeight: theme.bodyWeight,
      fontSize: Math.round(titleSize * 0.42),
      fill: theme.palette.muted,
      align: "center",
      baseline: "top",
      maxWidth: area.width * 0.8,
      lineHeight: 1.3,
    });
  }
  return nodes;
}

/** A heading + a wrapped, staggered bullet list. */
export function bulletSlide(opts: { title: string; bullets: string[]; stagger?: number } & SlideOptions): Node[] {
  const { theme, area, h } = resolve(opts);
  const titleSize = Math.round(h * 0.07);
  const bodySize = Math.round(h * 0.045);
  const nodes: Node[] = [heading(theme, area, opts.title, titleSize)];
  const listArea = inset(area, { top: titleSize * 1.8 });
  const rows = column(listArea, Math.max(1, opts.bullets.length), { itemHeight: bodySize * 1.7 });
  const step = opts.stagger ?? 0.4;
  opts.bullets.forEach((text, i) => {
    const box = rows[i]!;
    const start = i * step;
    nodes.push({
      id: `bullet-${i + 1}`,
      type: "text",
      x: box.x,
      y: box.y,
      text: `•  ${text}`,
      fontFamily: theme.bodyFont,
      fontWeight: theme.bodyWeight,
      fontSize: bodySize,
      fill: theme.palette.text,
      align: "left",
      baseline: "top",
      maxWidth: box.width,
      lineHeight: 1.25,
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
