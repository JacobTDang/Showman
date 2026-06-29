/**
 * LaTeX-quality math typesetting → Skia-renderable nodes.
 *
 * MathJax lays out the equation (fractions, exponents, radicals, sums, Greek, …) and
 * emits an SVG of glyph outlines. We parse that SVG at *build time* and bake each glyph
 * into a Showman `path` node, so the equation is:
 *   - rendered byte-identically by the deterministic engine (no MathJax at render time),
 *   - and made of real vector paths — so it composes with shape morphing ("rearrange
 *     the equation") for free.
 *
 * MathJax runs only here, in the authoring/build step; its version is pinned so the
 * baked path data — and therefore golden frames — stay stable.
 */

import { createRequire } from "node:module";
import type { GroupNode, Node, Color } from "../spec/types.js";
import { getTheme } from "./shared.js";

/** An affine transform restricted to translate + axis-aligned scale: p → (sx·x+tx, sy·y+ty). */
interface Affine {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

const IDENT: Affine = { sx: 1, sy: 1, tx: 0, ty: 0 };

/** Compose so the result maps p → a(b(p)). */
function compose(a: Affine, b: Affine): Affine {
  return { sx: a.sx * b.sx, sy: a.sy * b.sy, tx: a.sx * b.tx + a.tx, ty: a.sy * b.ty + a.ty };
}

/** Parse an SVG `transform` attribute (translate / scale / axis-aligned matrix), left→right. */
function parseTransform(attr: string): Affine {
  let m = IDENT;
  const re = /(translate|scale|matrix)\s*\(([^)]*)\)/g;
  for (const tok of attr.matchAll(re)) {
    const nums = (tok[2] ?? "")
      .split(/[\s,]+/)
      .filter((s) => s.length > 0)
      .map(Number);
    let step: Affine = IDENT;
    if (tok[1] === "translate") step = { sx: 1, sy: 1, tx: nums[0] ?? 0, ty: nums[1] ?? 0 };
    else if (tok[1] === "scale") step = { sx: nums[0] ?? 1, sy: nums[1] ?? nums[0] ?? 1, tx: 0, ty: 0 };
    else if (tok[1] === "matrix") step = { sx: nums[0] ?? 1, sy: nums[3] ?? 1, tx: nums[4] ?? 0, ty: nums[5] ?? 0 };
    m = compose(m, step);
  }
  return m;
}

const TOKEN_RE = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;
const fmt = (v: number): string => (Math.round(v * 100) / 100).toString();
const rectPath = (x: number, y: number, w: number, h: number): string => `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;

/** Operand layout per command: axes to transform for each operand (x, y, or pass-through). */
const LAYOUT: Record<string, ("x" | "y" | "r")[]> = {
  M: ["x", "y"],
  L: ["x", "y"],
  T: ["x", "y"],
  H: ["x"],
  V: ["y"],
  C: ["x", "y", "x", "y", "x", "y"],
  S: ["x", "y", "x", "y"],
  Q: ["x", "y", "x", "y"],
  A: ["r", "r", "r", "r", "r", "x", "y"],
};

/**
 * Apply an axis-aligned affine to an SVG path `d`, preserving curve structure. MathJax
 * glyph outlines use absolute commands; relative commands are handled defensively (the
 * translate part is dropped for deltas).
 */
function transformPath(d: string, t: Affine): string {
  const toks: string[] = [];
  for (const m of d.matchAll(TOKEN_RE)) toks.push(m[1] ?? m[2]!);
  const out: string[] = [];
  let i = 0;
  const isCmd = (s: string | undefined): boolean => s !== undefined && /^[A-Za-z]$/.test(s);
  while (i < toks.length) {
    const cmd = toks[i];
    if (!isCmd(cmd)) {
      i++;
      continue;
    }
    i++;
    const up = cmd!.toUpperCase();
    const rel = cmd !== up;
    out.push(cmd!);
    const layout = LAYOUT[up];
    if (!layout) continue; // Z (no operands) or unknown
    // Repeat the operand group while numbers remain (SVG allows "L1 2 3 4" = two L's).
    do {
      for (const axis of layout) {
        if (isCmd(toks[i]) || i >= toks.length) break;
        const v = parseFloat(toks[i]!);
        i++;
        if (axis === "r")
          out.push(fmt(v)); // radii/flags: pass through (arcs are absent in glyphs)
        else if (axis === "x") out.push(fmt(rel ? t.sx * v : t.sx * v + t.tx));
        else out.push(fmt(rel ? t.sy * v : t.sy * v + t.ty));
      }
    } while (!isCmd(toks[i]) && i < toks.length);
  }
  // Compact: "M 1 2 L 3 4" → "M1 2L3 4".
  return out.join(" ").replace(/ ([MmLlHhVvCcSsQqTtAaZz])/g, "$1");
}

/** Map of glyph id → path `d`, harvested from the SVG `<defs>`. */
function parseGlyphDefs(svg: string): Map<string, string> {
  const defs = new Map<string, string>();
  const block = svg.match(/<defs>([\s\S]*?)<\/defs>/);
  if (!block) return defs;
  for (const m of block[1]!.matchAll(/<path\s+id="([^"]+)"\s+d="([^"]+)"/g)) defs.set(m[1]!, m[2]!);
  return defs;
}

const ATTR = (tag: string, name: string): string | undefined => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

export interface TexResult {
  node: GroupNode;
  /** Rendered width/height in px (at the requested `size`). */
  width: number;
  height: number;
}

export interface TexOptions {
  latex: string;
  x?: number;
  y?: number;
  /** Font size in px (1em). Default 40. */
  size?: number;
  /** Glyph color. Default the theme's text color. */
  color?: Color;
  theme?: string;
  id?: string;
}

let pipeline: { convert: (tex: string) => string } | undefined;

/** Lazily build the pinned MathJax → SVG pipeline (CommonJS load keeps its init ordering correct). */
function getPipeline(): { convert: (tex: string) => string } {
  if (pipeline) return pipeline;
  const require = createRequire(import.meta.url);
  const { mathjax } = require("mathjax-full/js/mathjax.js") as {
    mathjax: { document: (s: string, o: unknown) => { convert: (t: string, o: unknown) => unknown } };
  };
  const { TeX } = require("mathjax-full/js/input/tex.js") as { TeX: new (o: unknown) => unknown };
  const { SVG } = require("mathjax-full/js/output/svg.js") as { SVG: new (o: unknown) => unknown };
  const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js") as {
    liteAdaptor: () => { outerHTML: (n: unknown) => string };
  };
  const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js") as { RegisterHTMLHandler: (a: unknown) => void };
  // mhchem registers the \ce{…} / \pu{…} chemistry macros (side-effecting import).
  require("mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js");
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  // A curated package set — AllPackages trips a MathJax bug (unguarded char-range lookup).
  const tex = new TeX({ packages: ["base", "ams", "newcommand", "noundefined", "mhchem"] });
  const svg = new SVG({ fontCache: "local" });
  const doc = mathjax.document("", { InputJax: tex, OutputJax: svg });
  pipeline = { convert: (t: string): string => adaptor.outerHTML(doc.convert(t, { display: true })) };
  // Pre-warm: exercise the common operators/chars once so MathJax's lazy char-range
  // tables are fully populated regardless of import order (a known init-order bug can
  // otherwise make the first conversions throw in some contexts). Result is discarded.
  try {
    pipeline.convert("x + \\frac{1}{2} = \\sqrt{a^2 - b^2} \\pm \\alpha");
    pipeline.convert("\\ce{2H2 + O2 -> 2H2O}"); // warm the mhchem char tables too
  } catch {
    /* surfaced loudly on the first real conversion if it persists */
  }
  return pipeline;
}

/**
 * Typeset a LaTeX string into a group of `path` nodes (one per glyph + fraction/radical
 * bar), positioned at (x, y) and scaled to `size` px per em. Deterministic and morphable.
 */
export function texToNodes(opts: TexOptions): TexResult {
  const theme = getTheme(opts.theme);
  const color = opts.color ?? theme.palette.text ?? "#1d2b2b";
  const size = opts.size ?? 40;
  const x = opts.x ?? 0;
  const y = opts.y ?? 0;
  const id = opts.id ?? "tex";
  const empty: TexResult = { node: { id, type: "group", x, y, children: [] }, width: 0, height: 0 };

  let svg: string;
  try {
    svg = getPipeline().convert(opts.latex);
  } catch (err) {
    // MathJax should not throw on well-formed input — a throw signals an internal/init
    // fault, not user error. Fail loudly rather than silently baking a blank frame.
    throw new Error(`MathJax failed to typeset ${JSON.stringify(opts.latex)}: ${(err as Error)?.message ?? String(err)}`);
  }
  // A TeX *syntax* error renders as an merror node — treat malformed LaTeX as an empty group.
  if (/data-mjx-error|data-mml-node="merror"/.test(svg)) return empty;

  const scale = size / 1000; // MathJax: 1000 units = 1em
  const defs = parseGlyphDefs(svg);
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/, "");

  const children: Node[] = [];
  let n = 0;
  let seenRoot = false;
  let outW = 0,
    outH = 0;
  // Walk the body tags with a transform stack. <svg>/<g> push, their closers pop; <use>
  // bakes a glyph, <rect> a bar/frame — each may carry its own transform (stretchy glyphs).
  const tagRe = /<(\/?)(svg|g|use|rect)\b([^>]*?)\/?>/g;
  let cur: Affine = IDENT;
  const stack: Affine[] = [];

  for (const m of body.matchAll(tagRe)) {
    const closing = m[1] === "/";
    const tag = m[2]!;
    const attrs = m[3] ?? "";

    if (tag === "svg") {
      if (closing) {
        cur = stack.pop() ?? IDENT;
        continue;
      }
      const vb = (ATTR(attrs, "viewBox") ?? "0 0 0 0").split(/\s+/).map(Number);
      const vbX = vb[0] ?? 0,
        vbY = vb[1] ?? 0,
        vbW = vb[2] ?? 0,
        vbH = vb[3] ?? 0;
      stack.push(cur);
      if (!seenRoot) {
        seenRoot = true;
        outW = vbW;
        outH = vbH;
        cur = compose(cur, { sx: scale, sy: scale, tx: -vbX * scale, ty: -vbY * scale });
      } else {
        // Nested viewport: map the inner viewBox into the element's x/y/width/height box.
        const sx = vbW ? Number(ATTR(attrs, "width") ?? vbW) / vbW : 1;
        const sy = vbH ? Number(ATTR(attrs, "height") ?? vbH) / vbH : 1;
        cur = compose(cur, { sx, sy, tx: Number(ATTR(attrs, "x") ?? 0) - vbX * sx, ty: Number(ATTR(attrs, "y") ?? 0) - vbY * sy });
      }
      continue;
    }
    if (tag === "g") {
      if (closing) cur = stack.pop() ?? IDENT;
      else {
        stack.push(cur);
        const tr = attrs.match(/transform="([^"]*)"/);
        if (tr) cur = compose(cur, parseTransform(tr[1]!));
      }
      continue;
    }
    if (closing) continue; // </use>, </rect>

    // <use>/<rect> may carry their own (stretch/translate) transform.
    const own = ATTR(attrs, "transform");
    const t = own ? compose(cur, parseTransform(own)) : cur;
    if (tag === "use") {
      const href = (ATTR(attrs, "xlink:href") ?? ATTR(attrs, "href") ?? "").replace(/^#/, "");
      const d = defs.get(href);
      if (d) children.push({ id: `${id}-g${n++}`, type: "path", x: 0, y: 0, d: transformPath(d, t), fill: color });
    } else {
      const rx = Number(ATTR(attrs, "x") ?? 0),
        ry = Number(ATTR(attrs, "y") ?? 0),
        rw = Number(ATTR(attrs, "width") ?? 0),
        rh = Number(ATTR(attrs, "height") ?? 0);
      const sw = Number(ATTR(attrs, "stroke-width") ?? 0);
      const hollow = ATTR(attrs, "fill") === "none" || sw > 0;
      if (hollow) {
        // A stroked frame (\boxed, \fbox): an even-odd outer/inner ring of thickness sw.
        const h = sw > 0 ? sw / 2 : 30;
        const d = `${rectPath(rx - h, ry - h, rw + 2 * h, rh + 2 * h)}${rectPath(rx + h, ry + h, rw - 2 * h, rh - 2 * h)}`;
        children.push({ id: `${id}-b${n++}`, type: "path", x: 0, y: 0, d: transformPath(d, t), fill: color, fillRule: "evenodd" });
      } else {
        children.push({ id: `${id}-b${n++}`, type: "path", x: 0, y: 0, d: transformPath(rectPath(rx, ry, rw, rh), t), fill: color });
      }
    }
  }

  return { node: { id, type: "group", x, y, children }, width: outW * scale, height: outH * scale };
}

/** Typeset a LaTeX string into a positioned group of glyph paths (see {@link texToNodes}). */
export function buildMath(opts: TexOptions): GroupNode {
  return texToNodes(opts).node;
}
