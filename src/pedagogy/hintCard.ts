/**
 * Hint card — a themeable bubble for one rung of a hint ladder: an accent edge, a "HINT" eyebrow
 * (with the level), and the (auto-wrapping) hint text. Pure; composes rect + text.
 */

import type { Node, GroupNode } from "../spec/types.js";
import type { Hint } from "./hints.js";
import { getTheme } from "../theme/themes.js";
import { withAlpha, mix } from "../engine/color.js";

export interface HintCardOptions {
  id?: string;
  hint: Hint | string;
  x: number;
  y: number;
  width?: number;
  theme?: string;
}

export function hintCard(opts: HintCardOptions): GroupNode {
  const id = opts.id ?? "hint";
  const theme = getTheme(opts.theme);
  const p = theme.palette;
  const text = typeof opts.hint === "string" ? opts.hint : opts.hint.text;
  const level = typeof opts.hint === "string" ? undefined : opts.hint.level;
  const x = opts.x;
  const y = opts.y;
  const w = opts.width ?? 420;
  const pad = 18;
  const edge = 6;
  const fontSize = 18;
  const eyebrowH = 22;
  const lineH = Math.round(fontSize * 1.35);
  const textW = w - pad * 2 - edge;
  // Estimate wrapped line count for the card height (the text node wraps exactly via maxWidth).
  const charsPerLine = Math.max(8, Math.floor(textW / (fontSize * 0.52)));
  // Count each explicit paragraph (the renderer splits on "\n" before word-wrapping), at least 1 line.
  const lines = text.split("\n").reduce((sum, para) => sum + Math.max(1, Math.ceil(para.length / charsPerLine)), 0);
  const cardH = pad + eyebrowH + lines * lineH + pad - 4;

  const children: Node[] = [
    { id: `${id}-edge`, type: "rect", x, y, width: edge, height: cardH, radius: 0, fill: p.accent },
    {
      id: `${id}-card`,
      type: "rect",
      x: x + edge,
      y,
      width: w - edge,
      height: cardH,
      radius: 12,
      fill: withAlpha(p.accent, 0.1),
      stroke: withAlpha(p.accent, 0.4),
      strokeWidth: 1.5,
    },
    {
      id: `${id}-eyebrow`,
      type: "text",
      x: x + edge + pad,
      y: y + pad + 4,
      text: level !== undefined ? `HINT ${level}` : "HINT",
      fontFamily: theme.headingFont,
      fontWeight: 700,
      fontSize: 13,
      // Blend the accent toward text so the eyebrow keeps a brand tint but stays legible on the pale
      // card (a raw light accent — e.g. gold on cream — fails contrast).
      fill: mix(p.accent, p.text, 0.45),
      align: "left",
      baseline: "middle",
      letterSpacing: 2,
    },
    {
      id: `${id}-text`,
      type: "text",
      x: x + edge + pad,
      y: y + pad + eyebrowH,
      text,
      fontFamily: theme.bodyFont,
      fontWeight: theme.bodyWeight,
      fontSize,
      fill: p.text,
      align: "left",
      baseline: "top",
      maxWidth: textW,
      lineHeight: 1.35,
    },
  ];
  return { id, type: "group", x: 0, y: 0, children };
}
