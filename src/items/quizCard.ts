/**
 * Quiz card — render a generated item as a themeable multiple-choice card (stem + lettered options),
 * with an optional reveal that highlights the correct choice. Pure; composes rect + text.
 */

import type { Node, GroupNode } from "../spec/types.js";
import type { GeneratedItem } from "./items.js";
import { getTheme } from "../theme/themes.js";
import { readableOn, withAlpha } from "../engine/color.js";
import { fillRamp, elevation, glowNode, surfaceFill, type Depth } from "../theme/depth.js";

export interface QuizCardOptions {
  id?: string;
  item: GeneratedItem;
  x: number;
  y: number;
  width?: number;
  theme?: string;
  /** Highlight the correct option (and dim the rest). Default false. */
  reveal?: boolean;
  /** Dimensionality: card lift + a sheen on the revealed answer (and a glow). Default "soft"; "flat" = none. */
  depth?: Depth;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function quizCard(opts: QuizCardOptions): GroupNode {
  const id = opts.id ?? "quiz";
  const theme = getTheme(opts.theme);
  const p = theme.palette;
  const item = opts.item;
  const x = opts.x;
  const y = opts.y;
  const w = opts.width ?? 460;
  const pad = 24;
  const stemH = 56;
  const rowH = 46;
  const gap = 10;
  const n = item.choices.length;
  const cardH = pad + stemH + n * (rowH + gap) + pad - gap;
  const depth = opts.depth ?? "soft";
  const cardFill = surfaceFill(p.bg, cardH, depth); // gentle surface gradient (or the bare bg when flat)

  const children: Node[] = [
    {
      id: `${id}-card`,
      type: "rect",
      x,
      y,
      width: w,
      height: cardH,
      radius: 16,
      fill: p.bg,
      ...(typeof cardFill === "string" ? {} : { gradient: cardFill }),
      stroke: withAlpha(p.muted, 0.35),
      strokeWidth: 1.5,
      ...(elevation(depth) ? { shadow: elevation(depth)! } : {}),
    },
    {
      id: `${id}-stem`,
      type: "text",
      x: x + pad,
      y: y + pad + 16,
      text: item.stem,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fontSize: 24,
      fill: p.text,
      align: "left",
      baseline: "middle",
    },
  ];

  item.choices.forEach((choice, i) => {
    const rowY = y + pad + stemH + i * (rowH + gap);
    const isCorrect = i === item.correctIndex;
    const highlight = opts.reveal && isCorrect;
    const dim = opts.reveal && !isCorrect;
    const rowFill = highlight ? p.accent : withAlpha(p.primary, 0.06);
    const badge = highlight ? readableOn(p.accent, "#0f172a", "#f8fafc") : p.primary;
    const textColor = highlight ? readableOn(p.accent, "#0f172a", "#f8fafc") : p.text;
    // On reveal, the correct row gets a warm glow halo behind it (golden-safe radial gradient).
    if (highlight) {
      const halo = glowNode(`${id}-glow-${i}`, x + w / 2, rowY + rowH / 2, rowH * 0.7, p.accent, depth);
      if (halo) children.push(halo);
    }
    const rowGrad = highlight ? fillRamp(p.accent, rowH, depth) : undefined; // sheen on the revealed answer
    children.push({
      id: `${id}-row-${i}`,
      type: "rect",
      x: x + pad,
      y: rowY,
      width: w - pad * 2,
      height: rowH,
      radius: 10,
      fill: rowFill,
      ...(rowGrad ? { gradient: rowGrad } : {}),
      opacity: dim ? 0.5 : 1,
    });
    children.push({
      id: `${id}-badge-${i}`,
      type: "ellipse",
      x: x + pad + 10,
      y: rowY + (rowH - 28) / 2,
      width: 28,
      height: 28,
      fill: highlight ? withAlpha("#000000", 0.12) : withAlpha(p.primary, 0.15),
    });
    children.push({
      id: `${id}-letter-${i}`,
      type: "text",
      x: x + pad + 24,
      y: rowY + rowH / 2,
      text: LETTERS[i] ?? "?",
      fontFamily: theme.headingFont,
      fontWeight: 700,
      fontSize: 16,
      fill: badge,
      align: "center",
      baseline: "middle",
      opacity: dim ? 0.6 : 1,
    });
    children.push({
      id: `${id}-choice-${i}`,
      type: "text",
      x: x + pad + 48,
      y: rowY + rowH / 2,
      text: choice,
      fontFamily: theme.bodyFont,
      fontWeight: theme.bodyWeight,
      fontSize: 19,
      fill: textColor,
      align: "left",
      baseline: "middle",
      opacity: dim ? 0.6 : 1,
    });
  });

  return { id, type: "group", x: 0, y: 0, children };
}
