/**
 * Golden scenes — blessed reference renders.
 *
 * These specs are rendered at fixed frames and their PNG output is committed under
 * test/golden/. The golden test re-renders and asserts byte-identical output; the
 * `golden:update` script regenerates the references when a change is intentional.
 *
 * Goldens are pinned to a machine + engine + font version (that is the whole
 * point). Until M1 bakes those into a container image, treat a local mismatch on a
 * different machine as "regenerate here", not "regression".
 */

import { SPEC_VERSION } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { coordinatePlane, plotLine, plotFunction, fractionCircle, numberLine, buildMorph, buildMath } from "../../src/math/index.js";
import { flowchart, table } from "../../src/diagram/index.js";
import { reaction } from "../../src/chem/index.js";
import { lineChart } from "../../src/chart/index.js";
import { codeBlock } from "../../src/code/index.js";
import { forceDiagram, battery, resistor, lamp, wire } from "../../src/physics/index.js";

export interface GoldenCase {
  name: string;
  spec: SceneSpec;
  /** Frame indices to render and compare. */
  frames: number[];
}

/** Pure-shape scene: rounded rect, stroked ellipse, rotation. No text (most portable). */
const shapes: SceneSpec = {
  specVersion: SPEC_VERSION,
  width: 320,
  height: 200,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#ffffff",
  nodes: [
    {
      id: "card",
      type: "rect",
      x: 30,
      y: 40,
      width: 120,
      height: 120,
      radius: 24,
      fill: "#1d6f72",
      rotation: 15,
      anchor: { x: 60, y: 60 },
    },
    { id: "ball", type: "ellipse", x: 180, y: 50, width: 100, height: 100, fill: "#ffb703", stroke: "#fb8500", strokeWidth: 6 },
    { id: "bar", type: "rect", x: 40, y: 170, width: 240, height: 16, radius: 8, fill: "#e63946" },
  ],
};

/** A tiny counting lesson: title, three apples that pop in, and their numbers. */
function countingLesson(): SceneSpec {
  const teal = "#1d6f72";
  const apple = "#e63946";
  const centers = [160, 320, 480];
  const nodes: SceneSpec["nodes"] = [
    {
      id: "title",
      type: "text",
      x: 320,
      y: 46,
      text: "Count to 3!",
      fontSize: 46,
      fontWeight: 800,
      fill: teal,
      align: "center",
      baseline: "middle",
    },
    {
      id: "subtitle",
      type: "text",
      x: 320,
      y: 320,
      text: "Let's count the apples",
      fontSize: 24,
      fontWeight: 500,
      fill: "#457b9d",
      align: "center",
      baseline: "middle",
    },
  ];
  centers.forEach((cx, i) => {
    const start = 0.3 + i * 0.3;
    const end = start + 0.6;
    nodes.push({
      id: `apple${i + 1}`,
      type: "ellipse",
      x: cx - 35,
      y: 150,
      width: 70,
      height: 70,
      fill: apple,
      anchor: { x: 35, y: 35 },
      tracks: [
        {
          property: "opacity",
          keyframes: [
            { t: start, value: 0 },
            { t: end, value: 1, easing: "easeOutQuad" },
          ],
        },
        {
          property: "scale",
          keyframes: [
            { t: start, value: 0.6 },
            { t: end, value: 1, easing: "easeOutBack" },
          ],
        },
      ],
    });
    nodes.push({
      id: `num${i + 1}`,
      type: "text",
      x: cx,
      y: 250,
      text: String(i + 1),
      fontSize: 34,
      fontWeight: 700,
      fill: teal,
      align: "center",
      baseline: "middle",
      tracks: [
        {
          property: "opacity",
          keyframes: [
            { t: end - 0.1, value: 0 },
            { t: end + 0.2, value: 1 },
          ],
        },
      ],
    });
  });
  return { specVersion: SPEC_VERSION, width: 640, height: 360, fps: 30, duration: 3, seed: 7, background: "#fdf6e3", nodes };
}

/** The three new engine primitives in one frame: an arc, a polyline, a counter. */
const mathPrimitives: SceneSpec = {
  specVersion: SPEC_VERSION,
  width: 320,
  height: 170,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#ffffff",
  nodes: [
    { id: "arc", type: "arc", x: 20, y: 25, radius: 60, startAngle: 0, endAngle: 270, fill: "#2a9d8f" },
    {
      id: "poly",
      type: "polyline",
      x: 165,
      y: 35,
      points: [
        { x: 0, y: 80 },
        { x: 40, y: 0 },
        { x: 80, y: 80 },
        { x: 120, y: 10 },
      ],
      stroke: "#e63946",
      strokeWidth: 5,
    },
    { id: "count", type: "counter", x: 165, y: 145, value: 42, prefix: "Score: ", fontSize: 28, fill: "#1d6f72" },
  ],
};

/** The headline algebra visual: a coordinate plane with a line and a parabola. */
function mathGraph(): SceneSpec {
  const plane = coordinatePlane({
    id: "p",
    x: 20,
    y: 20,
    width: 240,
    height: 200,
    xMin: -4,
    xMax: 4,
    yMin: -4,
    yMax: 4,
    theme: "ocean",
    step: 2,
  });
  const line = plotLine(plane, { m: 1, b: 1 }, { stroke: "#1d6f72", strokeWidth: 4 });
  const parab = plotFunction(plane, (x) => 0.4 * x * x - 3, { samples: 48 }, { stroke: "#ef6c35", strokeWidth: 4, id: "parab" });
  return {
    specVersion: SPEC_VERSION,
    width: 280,
    height: 240,
    fps: 1,
    duration: 1,
    seed: 1,
    background: "#eaf6fb",
    nodes: [plane.node, line, parab],
  };
}

/** A fraction pie (3/8) and a number line — the most-used number visuals. */
function mathNumber(): SceneSpec {
  const pie = fractionCircle({ id: "fc", x: 20, y: 30, radius: 70, numerator: 3, denominator: 8, theme: "berry" });
  const nl = numberLine({ id: "nl", x: 190, y: 90, width: 200, from: 0, to: 5, theme: "berry" });
  return { specVersion: SPEC_VERSION, width: 420, height: 180, fps: 1, duration: 1, seed: 1, background: "#fff5f8", nodes: [pie, nl.node] };
}

const STAR_D = "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z";
const CIRCLE_D = "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z";

/** Path import + shape morphing: a circle→star mid-morph, an SVG heart, and a star being drawn on. */
function pathMorph(): SceneSpec {
  const morph = {
    ...buildMorph({ from: CIRCLE_D, to: STAR_D, x: 15, y: 30, samples: 64, fill: "#2a9d8f", stroke: "#1d6f72", strokeWidth: 3 }),
    morph: 0.5,
  };
  return {
    specVersion: SPEC_VERSION,
    width: 340,
    height: 170,
    fps: 1,
    duration: 1,
    seed: 1,
    background: "#eaf6fb",
    nodes: [
      morph,
      {
        id: "heart",
        type: "path",
        x: 135,
        y: 35,
        d: "M50 28 C 35 4, -2 18, 50 64 C 102 18, 65 4, 50 28 Z",
        fill: "#e63946",
        stroke: "#a01a28",
        strokeWidth: 3,
      },
      { id: "star", type: "path", x: 235, y: 35, d: STAR_D, fill: "#ffb703", stroke: "#fb8500", strokeWidth: 3, progress: 0.6 },
    ],
  };
}

/** LaTeX-quality typesetting (MathJax → glyph paths): the quadratic formula. */
function mathTypeset(): SceneSpec {
  const eq = buildMath({ id: "eq", latex: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", x: 24, y: 28, size: 40, color: "#1d2b2b" });
  return { specVersion: SPEC_VERSION, width: 470, height: 140, fps: 1, duration: 1, seed: 1, background: "#fffdf7", nodes: [eq] };
}

/** Compositing: a multiply blend (overlapping discs) + a circular clip "spotlight" group.
 * (Blur is deliberately omitted — ctx.filter's cross-platform byte-identity is unproven, so blur
 * is treated as visually- not byte-deterministic; blend + clip are plain Skia ops like the rest.) */
function compositing(): SceneSpec {
  return {
    specVersion: SPEC_VERSION,
    width: 320,
    height: 160,
    fps: 1,
    duration: 1,
    seed: 1,
    background: "#fffdf7",
    nodes: [
      { id: "c1", type: "ellipse", x: 20, y: 30, width: 90, height: 90, fill: "#e63946" },
      { id: "c2", type: "ellipse", x: 65, y: 30, width: 90, height: 90, fill: "#2a9d8f", blend: "multiply" },
      {
        id: "spot",
        type: "group",
        x: 185,
        y: 18,
        clip: { width: 124, height: 124, radius: 62 },
        children: [
          { id: "bg", type: "rect", x: -10, y: -10, width: 160, height: 160, fill: "#264653" },
          { id: "star", type: "path", x: 12, y: 12, d: STAR_D, fill: "#ffb703" },
        ],
      },
    ],
  };
}

/** Typography foundation: a serif heading, a wrapped Inter paragraph, and a mono line on a dark
 * theme — exercises the new pinned fonts + multi-line word-wrap + lineHeight. Text rasterizes
 * through @napi-rs/canvas's bundled Skia (same on Win/Linux), like the existing text goldens. */
function typography(): SceneSpec {
  return {
    specVersion: SPEC_VERSION,
    width: 380,
    height: 210,
    fps: 1,
    duration: 1,
    seed: 1,
    background: "#0f172a",
    nodes: [
      {
        id: "h",
        type: "text",
        x: 20,
        y: 18,
        text: "Distributed Systems",
        fontFamily: "Source Serif 4",
        fontWeight: 600,
        fontSize: 30,
        fill: "#38bdf8",
        align: "left",
        baseline: "top",
      },
      {
        id: "p",
        type: "text",
        x: 20,
        y: 64,
        text: "A partition forces a choice between consistency and availability.",
        fontFamily: "Inter",
        fontWeight: 400,
        fontSize: 16,
        fill: "#e2e8f0",
        align: "left",
        baseline: "top",
        maxWidth: 250,
        lineHeight: 1.3,
      },
      {
        id: "code",
        type: "text",
        x: 20,
        y: 170,
        text: "fn solve() {}",
        fontFamily: "JetBrains Mono",
        fontWeight: 500,
        fontSize: 18,
        fill: "#fbbf24",
        align: "left",
        baseline: "top",
      },
    ],
  };
}

/** Paint upgrade: a gradient-filled card with a (hard) drop shadow, dashed strokes, on a
 * gradient + vignette + seeded-grain backdrop. All byte-deterministic — gradients/shadow are Skia
 * vector ops, grain is integer pixel math seeded per frame. */
function paint(): SceneSpec {
  return {
    specVersion: SPEC_VERSION,
    width: 340,
    height: 200,
    fps: 1,
    duration: 1,
    seed: 11,
    background: {
      fill: {
        type: "linear",
        from: { x: 0, y: 0 },
        to: { x: 0, y: 200 },
        stops: [
          { offset: 0, color: "#1e293b" },
          { offset: 1, color: "#0f172a" },
        ],
      },
      vignette: 0.35,
      grain: 0.15,
    },
    nodes: [
      {
        id: "card",
        type: "rect",
        x: 24,
        y: 30,
        width: 150,
        height: 110,
        radius: 18,
        gradient: {
          type: "linear",
          from: { x: 0, y: 0 },
          to: { x: 150, y: 110 },
          stops: [
            { offset: 0, color: "#38bdf8" },
            { offset: 1, color: "#6366f1" },
          ],
        },
        shadow: { color: "rgba(0,0,0,0.5)", blur: 0, offsetX: 6, offsetY: 8 },
      },
      {
        id: "ring",
        type: "ellipse",
        x: 208,
        y: 38,
        width: 92,
        height: 92,
        fill: "transparent",
        stroke: "#34d399",
        strokeWidth: 5,
        dash: [12, 8],
      },
      {
        id: "line",
        type: "polyline",
        x: 28,
        y: 168,
        points: [
          { x: 0, y: 0 },
          { x: 160, y: 0 },
        ],
        stroke: "#fbbf24",
        strokeWidth: 4,
        dash: [6, 6],
      },
    ],
  };
}

/** Diagram substrate: a small flowchart (boxes + auto-routed arrow + label) beside a data table —
 * the adult/college vocabulary. Pure builders over primitives + text; deterministic like the rest. */
function diagram(): SceneSpec {
  const fc = flowchart({
    nodes: [
      { id: "a", x: 20, y: 26, width: 130, height: 50, shape: "rounded", label: "Request", fill: "#dbeafe" },
      { id: "b", x: 24, y: 132, width: 122, height: 60, shape: "diamond", label: "Auth?", fill: "#fef9c3" },
    ],
    edges: [{ from: "a", to: "b", label: "in" }],
  });
  const t = table({
    x: 210,
    y: 34,
    rows: [
      ["Key", "Val"],
      ["a", "1"],
      ["b", "2"],
    ],
    columnAlign: ["left", "center"],
  });
  return { specVersion: SPEC_VERSION, width: 400, height: 220, fps: 1, duration: 1, seed: 1, background: "#f8fafc", nodes: [fc, t.node] };
}

/** Chemistry: an mhchem reaction with a labeled arrow — glyph paths + a vector arrow, deterministic
 * cross-platform like the math-typeset golden. (Molecules use shadow blur, so they stay out of
 * goldens and are covered by pixel tests instead.) */
function chemistry(): SceneSpec {
  return {
    specVersion: SPEC_VERSION,
    width: 440,
    height: 110,
    fps: 1,
    duration: 1,
    seed: 1,
    background: "#fffdf7",
    nodes: [reaction({ id: "rx", reactants: ["2H2", "O2"], products: ["2H2O"], conditions: "spark", x: 24, y: 26, size: 38 })],
  };
}

/** Chart suite: a two-series line chart — axes, gridlines, formatted ticks, legend, and lines.
 * All vector + text (no shadow blur), so it's deterministic cross-platform like the math goldens. */
function chartCase(): SceneSpec {
  const node = lineChart({
    id: "lc",
    x: 16,
    y: 14,
    width: 380,
    height: 230,
    theme: "daylight",
    title: "Growth",
    showPoints: true,
    series: [
      {
        name: "Users",
        points: [
          { x: 0, y: 10 },
          { x: 1, y: 24 },
          { x: 2, y: 22 },
          { x: 3, y: 40 },
          { x: 4, y: 62 },
        ],
      },
      {
        name: "Revenue",
        points: [
          { x: 0, y: 5 },
          { x: 1, y: 12 },
          { x: 2, y: 30 },
          { x: 3, y: 36 },
          { x: 4, y: 55 },
        ],
      },
    ],
  });
  return { specVersion: SPEC_VERSION, width: 412, height: 260, fps: 1, duration: 1, seed: 1, background: "#ffffff", nodes: [node] };
}

/** Code block: a syntax-highlighted editor card (shadow off for golden determinism — text + rects
 * only). Tokenizer output + colored monospace runs; deterministic cross-platform. */
function codeCase(): SceneSpec {
  const node = codeBlock({
    id: "cb",
    x: 16,
    y: 14,
    code: "function add(a, b) {\n  return a + b; // sum\n}",
    lang: "ts",
    title: "add.ts",
    fontSize: 18,
    highlightLines: [2],
    shadow: false,
  });
  return { specVersion: SPEC_VERSION, width: 380, height: 150, fps: 1, duration: 1, seed: 1, background: "#e2e8f0", nodes: [node] };
}

/** Physics: a free-body diagram beside a small circuit (battery–resistor–lamp). All polylines /
 * ellipses / text — no blur or gradient — so it's deterministic cross-platform. */
function physicsCase(): SceneSpec {
  const fbd = forceDiagram({
    id: "fd",
    x: 110,
    y: 80,
    bodyLabel: "m",
    bodyRadius: 18,
    forces: [
      { label: "N", magnitude: 50, angle: 90, color: "#16a34a" },
      { label: "mg", magnitude: 50, angle: 270, color: "#dc2626" },
      { label: "F", magnitude: 70, angle: 0, color: "#2563eb" },
    ],
  });
  const b = battery({ id: "b", x: 40, y: 210, label: "9V" });
  const r = resistor({ id: "r", x: 150, y: 210, label: "R" });
  const l = lamp({ id: "l", x: 260, y: 210 });
  const w = wire({ id: "w", points: [b.b, r.a] });
  const w2 = wire({ id: "w2", points: [r.b, l.a] });
  return {
    specVersion: SPEC_VERSION,
    width: 360,
    height: 280,
    fps: 1,
    duration: 1,
    seed: 1,
    background: "#f8fafc",
    nodes: [fbd, w, w2, b.node, r.node, l.node],
  };
}

export const GOLDEN_CASES: GoldenCase[] = [
  { name: "shapes", spec: shapes, frames: [0] },
  { name: "typography", spec: typography(), frames: [0] },
  { name: "paint", spec: paint(), frames: [0] },
  { name: "diagram", spec: diagram(), frames: [0] },
  { name: "chemistry", spec: chemistry(), frames: [0] },
  { name: "chart", spec: chartCase(), frames: [0] },
  { name: "code", spec: codeCase(), frames: [0] },
  { name: "physics", spec: physicsCase(), frames: [0] },
  { name: "path-morph", spec: pathMorph(), frames: [0] },
  { name: "math-typeset", spec: mathTypeset(), frames: [0] },
  { name: "compositing", spec: compositing(), frames: [0] },
  // frame 0: only title + subtitle visible (apples still hidden); frame 60 (t=2): fully composed.
  { name: "lesson", spec: countingLesson(), frames: [0, 60] },
  { name: "math-primitives", spec: mathPrimitives, frames: [0] },
  { name: "math-graph", spec: mathGraph(), frames: [0] },
  { name: "math-number", spec: mathNumber(), frames: [0] },
];

/** The committed filename for a golden frame. */
export function goldenFileName(name: string, frame: number): string {
  return `${name}.f${frame}.png`;
}
