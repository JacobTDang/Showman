/**
 * Narrated math lessons — full Scene Specs (theme + narration + captions, ready to
 * render) built from the math builders + motion presets, mirroring
 * `buildCountingLesson`. These cover the algebra spine (graphing lines & parabolas)
 * plus number-line arithmetic and fractions. Lessons that use the fan-out builders
 * (arrays, place value, equations, data) live alongside these once those land.
 */

import type { SceneSpec, Node, NarrationSegment, Track } from "../spec/types.js";
import { SPEC_VERSION } from "../spec/schema.js";
import { getTheme, type Theme } from "../theme/themes.js";
import { buildCountingLesson, type CountingLessonOptions } from "../lessons/templates.js";
import { popIn, fadeIn } from "../motion/presets.js";
import { drawOn, countUp } from "./presets.js";
import { coordinatePlane, plotLine, plotFunction, plotPoints, numberLine, fractionCircle, fractionBar } from "./builders.js";
import { buildArrayGrid } from "./arrayGrid.js";
import { buildBaseTenBlocks } from "./baseTenBlocks.js";
import { buildBalanceScale } from "./balanceScale.js";
import { buildBarGraph } from "./barGraph.js";
import { buildLabeledShape } from "./labeledShape.js";
import { buildPercentRing } from "./percentRing.js";

function title(theme: Theme, text: string, width: number): Node {
  return {
    id: "title",
    type: "text",
    x: width / 2,
    y: 48,
    text,
    fontSize: 42,
    fontFamily: theme.headingFont,
    fontWeight: theme.headingWeight,
    fill: theme.palette.primary,
    align: "center",
    baseline: "middle",
    tracks: popIn({ start: 0.1, duration: 0.6 }),
  };
}

const signed = (n: number) => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`);

export interface GraphLessonOptions {
  m?: number;
  b?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Graph a line y = mx + b: the line draws itself on, the intercept and slope are narrated. */
export function buildGraphingLesson(opts: GraphLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const m = opts.m ?? 2;
  const b = opts.b ?? 1;
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const planeW = 440;
  const planeH = 380;
  const plane = coordinatePlane({
    id: "plane",
    x: (width - planeW) / 2,
    y: 96,
    width: planeW,
    height: planeH,
    xMin: -6,
    xMax: 6,
    yMin: -6,
    yMax: 6,
    theme: opts.theme,
  });

  const line = plotLine(plane, { m, b }, { stroke: theme.palette.accent, strokeWidth: 6 });
  const pts = plotPoints(plane, [{ x: 0, y: b, label: `(0, ${b})` }], { fill: theme.palette.secondary });

  const nodes: Node[] = [
    title(theme, `y = ${m}x ${signed(b)}`, width),
    plane.node,
    { ...line, tracks: drawOn({ start: 1.2, duration: 1.8 }) } as Node,
    ...pts.map((p) => ({ ...p, tracks: fadeIn({ start: 3.2, duration: 0.5 }) }) as Node),
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: `Let's graph the line y equals ${m} x ${b >= 0 ? "plus" : "minus"} ${Math.abs(b)}.` },
    { t: 1.4, text: "Watch the line draw itself across the grid." },
    { t: 3.3, text: `It crosses the y-axis at ${b}.` },
    { t: 4.4, text: `The slope is ${m}: up ${m} for every step to the right.` },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 6.2,
    seed: 1,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface QuadraticLessonOptions {
  a?: number;
  b?: number;
  c?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Graph a parabola y = ax² + bx + c, drawn on with narration about its shape. */
export function buildQuadraticLesson(opts: QuadraticLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const a = opts.a ?? 1;
  const b = opts.b ?? 0;
  const c = opts.c ?? -3;
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const planeW = 440;
  const planeH = 380;
  const plane = coordinatePlane({
    id: "plane",
    x: (width - planeW) / 2,
    y: 96,
    width: planeW,
    height: planeH,
    xMin: -5,
    xMax: 5,
    yMin: -5,
    yMax: 6,
    theme: opts.theme,
  });
  const curve = plotFunction(plane, (x) => a * x * x + b * x + c, { samples: 90 }, { stroke: theme.palette.accent, strokeWidth: 6 });
  const vertexX = b === 0 ? 0 : -b / (2 * a);
  const vertexY = a * vertexX * vertexX + b * vertexX + c;
  const pts = plotPoints(plane, [{ x: vertexX, y: vertexY, label: "vertex" }], { fill: theme.palette.secondary });

  const nodes: Node[] = [
    title(theme, `y = ${a === 1 ? "" : a === -1 ? "−" : a}x²${b ? ` ${signed(b)}x` : ""} ${signed(c)}`, width),
    plane.node,
    { ...curve, tracks: drawOn({ start: 1.2, duration: 2.0 }) } as Node,
    ...pts.map((p) => ({ ...p, tracks: popIn({ start: 3.4, duration: 0.5 }) }) as Node),
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: "This is a parabola — the graph of a quadratic." },
    { t: 1.4, text: "It curves into a smooth U-shape." },
    { t: 3.5, text: "The lowest point is called the vertex." },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 5.6,
    seed: 2,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface AdditionLessonOptions {
  a?: number;
  b?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Add a + b on a number line: a marker hops one step at a time to the sum. */
export function buildAdditionLesson(opts: AdditionLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const a = Math.max(0, Math.floor(opts.a ?? 2));
  const b = Math.max(0, Math.floor(opts.b ?? 3));
  const sum = a + b;
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const max = Math.max(sum + 1, 5);
  const lineW = Math.min(760, max * 90);
  const nl = numberLine({ id: "nl", x: (width - lineW) / 2, y: 300, width: lineW, from: 0, to: max, theme: opts.theme });
  const r = 16;
  const start = 1.2;
  const step = 0.55;

  // One x-track + one y-track for the marker hopping 0 -> sum, one integer per hop.
  const baseY = nl.originY - r;
  const xkeys: Track["keyframes"] = [{ t: start, value: nl.originX + nl.toX(0) - r }];
  const ykeys: Track["keyframes"] = [{ t: start, value: baseY }];
  for (let i = 1; i <= sum; i++) {
    const t0 = start + (i - 1) * step;
    const tMid = t0 + step / 2;
    const t1 = t0 + step;
    xkeys.push({ t: t1, value: nl.originX + nl.toX(i) - r, easing: "easeInOutQuad" });
    ykeys.push({ t: tMid, value: baseY - 34, easing: "easeOutQuad" });
    ykeys.push({ t: t1, value: baseY, easing: "easeInQuad" });
  }
  const marker: Node = {
    id: "marker",
    type: "ellipse",
    x: nl.originX + nl.toX(0) - r,
    y: baseY,
    width: r * 2,
    height: r * 2,
    fill: theme.palette.accent,
    tracks: [
      { property: "x", keyframes: xkeys },
      { property: "y", keyframes: ykeys },
    ],
  };

  const nodes: Node[] = [
    title(theme, `${a} + ${b} = ?`, width),
    {
      id: "sentence",
      type: "counter",
      x: width / 2,
      y: 150,
      value: sum,
      prefix: `${a} + ${b} = `,
      fontSize: 40,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.secondary,
      tracks: fadeIn({ start: start + sum * step + 0.3, duration: 0.5 }),
    },
    nl.node,
    marker,
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: `Let's add ${a} plus ${b} on the number line.` },
    { t: start, text: `Start at zero and hop forward ${a}.` },
    { t: start + a * step, text: `Now hop ${b} more.` },
    { t: start + sum * step + 0.3, text: `We land on ${sum}. So ${a} plus ${b} equals ${sum}!` },
  ];
  const duration = Math.round((start + sum * step + 2.2) * 10) / 10;
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration,
    seed: 3,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface FractionLessonOptions {
  numerator?: number;
  denominator?: number;
  topic?: string;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Show a fraction as a filling pie with its symbol. */
export function buildFractionLesson(opts: FractionLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const denom = Math.max(2, Math.floor(opts.denominator ?? 4));
  const num = Math.max(1, Math.min(denom, Math.floor(opts.numerator ?? 3)));
  const topic = opts.topic ?? "pizza";
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const radius = 130;
  const pie = fractionCircle({ id: "pie", x: width / 2 - radius, y: 150, radius, numerator: num, denominator: denom, theme: opts.theme });

  const nodes: Node[] = [
    title(theme, `Fractions: ${num}/${denom}`, width),
    { ...pie, tracks: popIn({ start: 0.8, duration: 0.6 }) } as Node,
    {
      id: "label",
      type: "counter",
      x: width / 2,
      y: 470,
      value: num,
      suffix: `/${denom}`,
      fontSize: 56,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.primary,
      tracks: fadeIn({ start: 1.6, duration: 0.5 }),
    },
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: `Here is one whole ${topic}, cut into ${denom} equal pieces.` },
    { t: 1.6, text: `We have ${num} of those ${denom} pieces.` },
    { t: 3.0, text: `That's the fraction ${num} over ${denom}.` },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 5.0,
    seed: 4,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface MultiplicationLessonOptions {
  rows?: number;
  cols?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Multiply rows × cols with an array of dots, counting up to the product. */
export function buildMultiplicationLesson(opts: MultiplicationLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const rows = Math.max(1, Math.floor(opts.rows ?? 3));
  const cols = Math.max(1, Math.floor(opts.cols ?? 4));
  const product = rows * cols;
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const gap = 64;
  const dotRadius = 14;
  const gridW = 2 * dotRadius + (cols - 1) * gap;
  const array = buildArrayGrid({ id: "arr", x: (width - gridW) / 2, y: 170, rows, cols, gap, dotRadius, theme: opts.theme });

  const nodes: Node[] = [
    title(theme, `${rows} × ${cols} = ?`, width),
    { ...array, tracks: popIn({ start: 0.8, duration: 0.6 }) } as Node,
    {
      id: "product",
      type: "counter",
      x: width / 2,
      y: height - 70,
      value: product,
      prefix: `${rows} × ${cols} = `,
      fontSize: 44,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.secondary,
      tracks: countUp({ start: 2.0, duration: 1.0, to: product }),
    },
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: `Let's multiply ${rows} times ${cols}.` },
    { t: 1.0, text: `Here are ${rows} rows of ${cols} dots.` },
    { t: 2.0, text: "Count them all up..." },
    { t: 3.2, text: `${rows} times ${cols} equals ${product}!` },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 5.4,
    seed: 5,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface PlaceValueLessonOptions {
  hundreds?: number;
  tens?: number;
  ones?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Build a 3-digit number from base-ten blocks (hundreds, tens, ones). */
export function buildPlaceValueLesson(opts: PlaceValueLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const h = Math.max(0, Math.floor(opts.hundreds ?? 1));
  const t = Math.max(0, Math.floor(opts.tens ?? 2));
  const o = Math.max(0, Math.floor(opts.ones ?? 3));
  const number = h * 100 + t * 10 + o;
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const blocks = buildBaseTenBlocks({ id: "btb", x: 280, y: 190, hundreds: h, tens: t, ones: o, unit: 22, theme: opts.theme });
  const nodes: Node[] = [
    title(theme, `Place Value: ${number}`, width),
    { ...blocks, tracks: popIn({ start: 0.8, duration: 0.6 }) } as Node,
    {
      id: "breakdown",
      type: "text",
      x: width / 2,
      y: height - 60,
      text: `${h} hundred, ${t} tens, ${o} ones`,
      fontSize: 30,
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fill: theme.palette.secondary,
      align: "center",
      baseline: "middle",
      tracks: fadeIn({ start: 2.0, duration: 0.6 }),
    },
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: `Let's build the number ${number}.` },
    { t: 1.0, text: `${h} hundred, ${t} tens, and ${o} ones.` },
    { t: 2.4, text: `Together that makes ${number}.` },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 4.6,
    seed: 6,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface EquationLessonOptions {
  a?: number;
  b?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Introduce equations as a balance scale: both sides weigh the same. */
export function buildEquationLesson(opts: EquationLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const a = Math.max(1, Math.floor(opts.a ?? 2));
  const b = Math.max(1, Math.floor(opts.b ?? 3));
  const sum = a + b;
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const scaleW = 440;
  const scale = buildBalanceScale({
    id: "scale",
    x: (width - scaleW) / 2,
    y: 210,
    left: sum,
    right: sum,
    width: scaleW,
    theme: opts.theme,
    leftLabel: `${a} + ${b}`,
    rightLabel: `${sum}`,
  });
  const nodes: Node[] = [title(theme, `${a} + ${b} = ${sum}`, width), { ...scale, tracks: popIn({ start: 0.8, duration: 0.6 }) } as Node];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: "An equation is like a balance scale." },
    { t: 1.4, text: `On the left we have ${a} plus ${b}.` },
    { t: 2.6, text: `On the right we have ${sum}.` },
    { t: 3.6, text: "Both sides weigh the same — that's what the equals sign means!" },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 6.0,
    seed: 7,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface DataLessonOptions {
  bars?: { label: string; value: number }[];
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Read a bar graph: which is tallest, and what taller bars mean. */
export function buildDataLesson(opts: DataLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const bars = opts.bars ?? [
    { label: "Cats", value: 5 },
    { label: "Dogs", value: 8 },
    { label: "Birds", value: 3 },
    { label: "Fish", value: 6 },
  ];
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const gW = 540;
  const graph = buildBarGraph({ id: "graph", x: (width - gW) / 2, y: 150, width: gW, height: 300, bars, theme: opts.theme });
  const top = bars.reduce((m, x) => (x.value > m.value ? x : m), bars[0] ?? { label: "", value: 0 });
  const nodes: Node[] = [title(theme, "Reading a Bar Graph", width), { ...graph, tracks: popIn({ start: 0.8, duration: 0.6 }) } as Node];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: "This bar graph shows how many of each." },
    { t: 1.6, text: `The tallest bar is ${top.label}, with ${top.value}.` },
    { t: 3.0, text: "Taller bars mean bigger numbers." },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 4.8,
    seed: 8,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface SubtractionLessonOptions {
  a?: number;
  b?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Subtract a − b on a number line: a marker starts at a and hops backward to a − b. */
export function buildSubtractionLesson(opts: SubtractionLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const a = Math.max(0, Math.floor(opts.a ?? 5));
  const b = Math.max(0, Math.min(a, Math.floor(opts.b ?? 2)));
  const diff = a - b;
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const max = Math.max(a + 1, 5);
  const lineW = Math.min(760, max * 90);
  const nl = numberLine({ id: "nl", x: (width - lineW) / 2, y: 300, width: lineW, from: 0, to: max, theme: opts.theme });
  const r = 16;
  const start = 1.2;
  const step = 0.55;
  const baseY = nl.originY - r;
  const xkeys: Track["keyframes"] = [{ t: start, value: nl.originX + nl.toX(a) - r }];
  const ykeys: Track["keyframes"] = [{ t: start, value: baseY }];
  for (let i = 1; i <= b; i++) {
    const t0 = start + (i - 1) * step;
    xkeys.push({ t: t0 + step, value: nl.originX + nl.toX(a - i) - r, easing: "easeInOutQuad" });
    ykeys.push({ t: t0 + step / 2, value: baseY - 34, easing: "easeOutQuad" });
    ykeys.push({ t: t0 + step, value: baseY, easing: "easeInQuad" });
  }
  const marker: Node = {
    id: "marker",
    type: "ellipse",
    x: nl.originX + nl.toX(a) - r,
    y: baseY,
    width: r * 2,
    height: r * 2,
    fill: theme.palette.accent,
    tracks: [
      { property: "x", keyframes: xkeys },
      { property: "y", keyframes: ykeys },
    ],
  };
  const nodes: Node[] = [
    title(theme, `${a} − ${b} = ?`, width),
    {
      id: "sentence",
      type: "counter",
      x: width / 2,
      y: 150,
      value: diff,
      prefix: `${a} − ${b} = `,
      fontSize: 40,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.secondary,
      tracks: fadeIn({ start: start + b * step + 0.3, duration: 0.5 }),
    },
    nl.node,
    marker,
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: `Let's take ${a} and subtract ${b}.` },
    { t: start, text: `Start at ${a} and hop back ${b}.` },
    { t: start + b * step + 0.3, text: `We land on ${diff}. So ${a} minus ${b} equals ${diff}!` },
  ];
  const duration = Math.round((start + b * step + 2.2) * 10) / 10;
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration,
    seed: 9,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface DivisionLessonOptions {
  total?: number;
  groups?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Divide total ÷ groups by sharing into equal rows (an array), each row a group. */
export function buildDivisionLesson(opts: DivisionLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const total = Math.max(1, Math.floor(opts.total ?? 12));
  const groups = Math.max(1, Math.floor(opts.groups ?? 3));
  const per = Math.max(1, Math.floor(total / groups));
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const gap = 60;
  const dotRadius = 14;
  const gridW = 2 * dotRadius + (per - 1) * gap;
  const array = buildArrayGrid({ id: "share", x: (width - gridW) / 2, y: 180, rows: groups, cols: per, gap, dotRadius, theme: opts.theme });
  const nodes: Node[] = [
    title(theme, `${total} ÷ ${groups} = ?`, width),
    { ...array, tracks: popIn({ start: 0.8, duration: 0.6 }) } as Node,
    {
      id: "answer",
      type: "counter",
      x: width / 2,
      y: height - 70,
      value: per,
      prefix: `${total} ÷ ${groups} = `,
      fontSize: 44,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.secondary,
      tracks: fadeIn({ start: 2.4, duration: 0.5 }),
    },
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: `Let's share ${total} equally into ${groups} groups.` },
    { t: 1.0, text: `Each row is one group.` },
    { t: 2.4, text: `Every group gets ${per}. So ${total} divided by ${groups} is ${per}!` },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 4.8,
    seed: 10,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface DecimalLessonOptions {
  tenths?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Show a decimal as tenths: a bar split into 10 parts with `tenths` shaded = 0.t. */
export function buildDecimalLesson(opts: DecimalLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const tenths = Math.max(0, Math.min(10, Math.floor(opts.tenths ?? 7)));
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const barW = 640;
  const bar = fractionBar({
    id: "bar",
    x: (width - barW) / 2,
    y: 200,
    width: barW,
    height: 90,
    numerator: tenths,
    denominator: 10,
    theme: opts.theme,
  });
  const nodes: Node[] = [
    title(theme, `Decimals: 0.${tenths}`, width),
    { ...bar, tracks: popIn({ start: 0.8, duration: 0.6 }) } as Node,
    {
      id: "value",
      type: "counter",
      x: width / 2,
      y: 380,
      value: tenths / 10,
      decimals: 1,
      prefix: `${tenths}/10 = `,
      fontSize: 48,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.primary,
      tracks: fadeIn({ start: 1.6, duration: 0.5 }),
    },
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: "One whole, split into ten equal parts." },
    { t: 1.6, text: `We shade ${tenths} of the ten parts.` },
    { t: 3.0, text: `${tenths} tenths is the decimal 0 point ${tenths}.` },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 5.0,
    seed: 11,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

const SHAPE_NAMES: Record<number, string> = { 3: "triangle", 4: "square", 5: "pentagon", 6: "hexagon", 7: "heptagon", 8: "octagon" };

export interface GeometryLessonOptions {
  sides?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Name a polygon and count its sides and corners (vertices). */
export function buildGeometryLesson(opts: GeometryLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const sides = Math.max(3, Math.min(8, Math.floor(opts.sides ?? 4)));
  const name = SHAPE_NAMES[sides] ?? `${sides}-gon`;
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const radius = 140;
  const shape = buildLabeledShape({ id: "shape", sides, radius, x: width / 2 - radius, y: 120, theme: opts.theme, showAngle: true });
  const nodes: Node[] = [
    title(theme, `Shapes: the ${name}`, width),
    { ...shape, tracks: popIn({ start: 0.7, duration: 0.6 }) } as Node,
    {
      id: "facts",
      type: "text",
      x: width / 2,
      y: height - 56,
      text: `${sides} sides · ${sides} corners`,
      fontSize: 30,
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fill: theme.palette.secondary,
      align: "center",
      baseline: "middle",
      tracks: fadeIn({ start: 1.8, duration: 0.5 }),
    },
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: `This shape is a ${name}.` },
    { t: 1.8, text: `It has ${sides} straight sides and ${sides} corners, which we call vertices.` },
    { t: 3.6, text: `Every ${name} has ${sides} of each.` },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 5.4,
    seed: 12,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface PercentLessonOptions {
  percent?: number;
  theme?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/** Show a percent as a filling ring — "out of 100". */
export function buildPercentLesson(opts: PercentLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const percent = Math.max(0, Math.min(100, Math.floor(opts.percent ?? 75)));
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;

  const radius = 120;
  const ring = buildPercentRing({ id: "ring", percent, x: width / 2 - radius, y: 140, radius, thickness: 34, theme: opts.theme });
  const nodes: Node[] = [
    title(theme, `Percents: ${percent}%`, width),
    { ...ring, tracks: popIn({ start: 0.7, duration: 0.6 }) } as Node,
    {
      id: "meaning",
      type: "text",
      x: width / 2,
      y: height - 56,
      text: `${percent} out of every 100`,
      fontSize: 30,
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fill: theme.palette.secondary,
      align: "center",
      baseline: "middle",
      tracks: fadeIn({ start: 1.8, duration: 0.5 }),
    },
  ];
  const narration: NarrationSegment[] = [
    { t: 0.2, text: "Percent means 'out of one hundred'." },
    { t: 1.8, text: `So ${percent} percent means ${percent} out of every hundred.` },
    { t: 3.4, text: `The ring is ${percent} percent full.` },
  ];
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration: 5.2,
    seed: 13,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

/** All math lesson topics the dispatcher understands. */
export type MathTopic =
  | "counting"
  | "addition"
  | "subtraction"
  | "multiplication"
  | "division"
  | "fraction"
  | "decimal"
  | "percent"
  | "place-value"
  | "geometry"
  | "graphing"
  | "quadratic"
  | "equation"
  | "data";

/** Unified options accepted by {@link buildMathLesson} (every lesson's options share optional fields). */
export type MathLessonOptions = CountingLessonOptions &
  GraphLessonOptions &
  QuadraticLessonOptions &
  AdditionLessonOptions &
  SubtractionLessonOptions &
  MultiplicationLessonOptions &
  DivisionLessonOptions &
  FractionLessonOptions &
  DecimalLessonOptions &
  PlaceValueLessonOptions &
  GeometryLessonOptions &
  PercentLessonOptions &
  EquationLessonOptions &
  DataLessonOptions;

/** Dispatch to the right lesson builder by topic — the entry point an agent calls. */
export function buildMathLesson(topic: MathTopic, params: MathLessonOptions = {}): SceneSpec {
  switch (topic) {
    case "counting":
      return buildCountingLesson(params);
    case "addition":
      return buildAdditionLesson(params);
    case "subtraction":
      return buildSubtractionLesson(params);
    case "multiplication":
      return buildMultiplicationLesson(params);
    case "division":
      return buildDivisionLesson(params);
    case "fraction":
      return buildFractionLesson(params);
    case "decimal":
      return buildDecimalLesson(params);
    case "percent":
      return buildPercentLesson(params);
    case "place-value":
      return buildPlaceValueLesson(params);
    case "geometry":
      return buildGeometryLesson(params);
    case "graphing":
      return buildGraphingLesson(params);
    case "quadratic":
      return buildQuadraticLesson(params);
    case "equation":
      return buildEquationLesson(params);
    case "data":
      return buildDataLesson(params);
    default: {
      const _exhaustive: never = topic;
      throw new Error(`Unknown math topic: ${String(_exhaustive)}`);
    }
  }
}
