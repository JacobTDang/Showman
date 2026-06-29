/**
 * Code block — a syntax-highlighted, monospaced editor card: a dark surface with a soft shadow,
 * optional window chrome (title + traffic-light dots), a line-number gutter, optional highlight
 * bands, and an optional line-by-line reveal. Build-time tokenization keeps the render deterministic.
 * Because JetBrains Mono is monospaced, runs are positioned by character column.
 */

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import type { Node, GroupNode, Track } from "../spec/types.js";
import { ensureFontsRegistered } from "../engine/fonts.js";
import { tokenize, type Language } from "./tokenize.js";
import { CODE_DARK, type CodeTheme } from "./theme.js";

export interface CodeBlockOptions {
  id?: string;
  x: number;
  y: number;
  code: string;
  lang?: Language;
  theme?: CodeTheme;
  fontSize?: number;
  /** Fixed width in px; otherwise sized to the longest line. */
  width?: number;
  showLineNumbers?: boolean;
  /** Window chrome (title bar + three dots). Default true. */
  chrome?: boolean;
  title?: string;
  /** 1-based line numbers to highlight with a band. */
  highlightLines?: number[];
  /** Soft drop shadow under the card. Default true. */
  shadow?: boolean;
  /** Reveal the code line-by-line. Default false. */
  animate?: boolean;
}

const FONT = "JetBrains Mono";
let measureCtx: SKRSContext2D | null = null;
function charWidth(fontSize: number): number {
  if (!measureCtx) {
    ensureFontsRegistered();
    measureCtx = createCanvas(16, 16).getContext("2d");
  }
  measureCtx.font = `${fontSize}px "${FONT}"`;
  return measureCtx.measureText("M").width; // monospace → every char is this wide
}

export function codeBlock(opts: CodeBlockOptions): GroupNode {
  const id = opts.id ?? "code";
  const theme = opts.theme ?? CODE_DARK;
  const fontSize = opts.fontSize ?? 18;
  const lineH = Math.round(fontSize * 1.5);
  const cw = charWidth(fontSize);
  const pad = Math.round(fontSize * 0.9);
  const showNums = opts.showLineNumbers ?? true;
  const chrome = opts.chrome ?? true;

  const lines = tokenize(opts.code, opts.lang ?? "js");
  const maxCols = lines.reduce(
    (m, ln) =>
      Math.max(
        m,
        ln.reduce((s, t) => s + t.text.length, 0),
      ),
    0,
  );
  const gutterW = showNums ? Math.round(cw * (String(lines.length).length + 2)) : 0;
  const chromeH = chrome ? Math.round(fontSize * 1.9) : 0;
  const contentX = opts.x + pad + gutterW;
  const contentTop = opts.y + chromeH + pad * 0.6;
  const width = opts.width ?? Math.round(pad * 2 + gutterW + maxCols * cw + cw);
  const height = chromeH + pad * 1.2 + lines.length * lineH;
  const highlight = new Set(opts.highlightLines ?? []);

  const children: Node[] = [];
  // Card.
  children.push({
    id: `${id}-card`,
    type: "rect",
    x: opts.x,
    y: opts.y,
    width,
    height,
    radius: 12,
    fill: theme.bg,
    ...(opts.shadow !== false ? { shadow: { color: "rgba(2,6,23,0.45)", blur: 24, offsetY: 10 } } : {}),
  });
  // Window chrome.
  if (chrome) {
    children.push({ id: `${id}-chrome`, type: "rect", x: opts.x, y: opts.y, width, height: chromeH, radius: 12, fill: theme.chrome });
    children.push({ id: `${id}-chrome-fill`, type: "rect", x: opts.x, y: opts.y + chromeH - 12, width, height: 12, fill: theme.chrome }); // square off the bottom of the bar
    const dotY = opts.y + chromeH / 2;
    const dots = ["#ef4444", "#f59e0b", "#22c55e"];
    dots.forEach((c, i) =>
      children.push({ id: `${id}-dot-${i}`, type: "ellipse", x: opts.x + pad + i * 18 - 5, y: dotY - 5, width: 10, height: 10, fill: c }),
    );
    if (opts.title !== undefined) {
      children.push({
        id: `${id}-title`,
        type: "text",
        x: opts.x + width / 2,
        y: dotY,
        text: opts.title,
        fontFamily: FONT,
        fontSize: Math.round(fontSize * 0.78),
        fill: theme.gutter,
        align: "center",
        baseline: "middle",
      });
    }
  }

  lines.forEach((line, li) => {
    const ly = contentTop + li * lineH;
    if (highlight.has(li + 1)) {
      children.push({
        id: `${id}-hl-${li}`,
        type: "rect",
        x: opts.x + 2,
        y: ly - lineH * 0.1,
        width: width - 4,
        height: lineH,
        fill: theme.lineHighlight,
      });
    }
    if (showNums) {
      children.push({
        id: `${id}-ln-${li}`,
        type: "text",
        x: opts.x + pad + gutterW - cw,
        y: ly + lineH / 2,
        text: String(li + 1),
        fontFamily: FONT,
        fontSize: Math.round(fontSize * 0.9),
        fill: theme.gutter,
        align: "right",
        baseline: "middle",
      });
    }
    let col = 0;
    const lineNodes: Node[] = [];
    line.forEach((tok, ti) => {
      if (tok.text.trim() !== "") {
        lineNodes.push({
          id: `${id}-t-${li}-${ti}`,
          type: "text",
          x: contentX + col * cw,
          y: ly + lineH / 2,
          text: tok.text,
          fontFamily: FONT,
          fontSize,
          fill: theme.token[tok.type],
          align: "left",
          baseline: "middle",
        });
      }
      col += tok.text.length;
    });
    if (opts.animate) {
      const start = Math.min(2.2, li * 0.12);
      const fade: Track[] = [
        {
          property: "opacity",
          keyframes: [
            { t: start, value: 0 },
            { t: start + 0.25, value: 1 },
          ],
        },
      ];
      lineNodes.forEach((nd) => (nd.tracks = fade));
    }
    children.push(...lineNodes);
  });

  return { id, type: "group", x: 0, y: 0, children };
}
