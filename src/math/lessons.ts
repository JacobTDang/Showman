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
import { popIn, fadeIn } from "../motion/presets.js";
import { drawOn } from "./presets.js";
import { coordinatePlane, plotLine, plotFunction, plotPoints, numberLine, fractionCircle } from "./builders.js";

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
