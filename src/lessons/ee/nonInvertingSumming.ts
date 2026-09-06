/**
 * ee.nonInvertingSumming — the other two stages the same two rules give you.
 *
 * First the non-inverting stage. The input goes straight to the plus terminal, so the
 * minus terminal is dragged to it, and R_f with R_g is just a divider looking back at the
 * output: v_in = v_out·R_g/(R_f+R_g). Turn that around and the gain is 1 + R_f/R_g —
 * always at least one, and never upside down. The scope makes the difference from the
 * inverting stage obvious: input and output rise together.
 *
 * Then the summing amplifier, which is the inverting stage with more than one input. The
 * inverting node is held at zero whatever happens, so each input pushes its own current
 * v_k/R_k into it and never notices the others. The currents add at the node, and the scope
 * shows it: two inputs at different frequencies on their own planes, and one output that is
 * literally their weighted sum, wiggle for wiggle.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, xyCurvePane, type Beat } from "./kit.js";
import { nonInvertingStage, summingStage } from "./opAmpSchematics.js";
import { fade, fadeBetween, fmtR, withTracks } from "./util.js";

/** The two stages' resistors, and the drive. Exported so a test can predict what is drawn. */
export const SUMMING = {
  /** Feedback resistor, shared by both halves, ohms. */
  Rf: 10e3,
  /** Non-inverting: from the inverting node to the common rail, ohms. */
  Rg: 10e3,
  /** Summing: the first input's resistor, ohms. */
  R1: 10e3,
  /** Summing: the second input's resistor — half of R1, so twice the weight. */
  R2: 5e3,
  /** Non-inverting input amplitude, volts. */
  Vni: 2,
  /** Summing input amplitudes, volts. */
  V1: 1,
  V2: 0.5,
  /** Seconds on the scope's time axis. */
  scopeT: 4,
  /** Drive frequencies on that axis, Hz. */
  f1: 0.5,
  f2: 1.5,
} as const;

export interface NonInvertingSummingOptions {
  theme?: string;
}

const T_NI = 0.5;
const T_NI_RUN = 5.5;
const T_SUM = 13;
const T_SUM_RUN = 18.5;
const T_NOTE = 27;
const RUN = 6.5;

export function buildNonInvertingSumming(o: NonInvertingSummingOptions = {}): SceneSpec {
  const { Rf, Rg, R1, R2, Vni, V1, V2, scopeT, f1, f2 } = SUMMING;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const gainNi = 1 + Rf / Rg;
  const w1 = Rf / R1;
  const w2 = Rf / R2;

  const vni = (t: number) => Vni * Math.sin(2 * Math.PI * f1 * t);
  const v1 = (t: number) => V1 * Math.sin(2 * Math.PI * f1 * t);
  const v2 = (t: number) => V2 * Math.sin(2 * Math.PI * f2 * t);
  const vsum = (t: number) => -(w1 * v1(t) + w2 * v2(t));
  /** One voltage scale for every plane in the summing scope, so the sum can be read by eye. */
  const sumAxis = (w1 * V1 + w2 * V2) * 1.12;
  const niAxis = gainNi * Vni * 1.12;

  /* --------------------------------------------------- half one: non-inverting */
  const niSch = nonInvertingStage({
    id: "ns-sch-ni",
    x: LAYOUT.schematic.x + 55,
    y: LAYOUT.schematic.y + 28,
    current: true,
    rfLabel: `R_f = ${fmtR(Rf)}`,
    rgLabel: `R_g = ${fmtR(Rg)}`,
    ...th,
  });
  const eqX = LAYOUT.equation.x;
  /** The equation column is reused by the second half, so the first half's must clear out. */
  const untilSwap = (node: Node, at: number): Node => ({ ...node, tracks: fadeBetween(at, T_SUM) });
  const niBeat: Beat = {
    at: T_NI,
    dur: 5,
    say: "The non-inverting stage. The input drives the plus terminal directly, so the minus terminal is dragged up to meet it, and R f and R g form a divider looking back from the output.",
    nodes: [
      withTracks(niSch.node, fadeBetween(T_NI, T_SUM)),
      untilSwap(
        equationPane({
          id: "ns-eq-ni",
          latex: "v_{in}=v_{out}\\frac{R_g}{R_f+R_g}\\;\\Rightarrow\\;\\frac{v_{out}}{v_{in}}=1+\\frac{R_f}{R_g}",
          x: eqX,
          y: LAYOUT.equation.y + 6,
          at: T_NI + 1,
          size: 23,
          ...th,
        }).node,
        T_NI + 1,
      ),
      {
        id: "ns-ctr-gain",
        type: "counter",
        x: eqX,
        y: LAYOUT.equation.y + 90,
        value: gainNi,
        decimals: 1,
        prefix: "gain = ",
        suffix: " V/V",
        fontFamily: LABEL_FONT,
        fontSize: 26,
        fill: theme.palette.accent,
        align: "left",
        baseline: "middle",
        tracks: fadeBetween(T_NI + 2, T_SUM),
      },
    ],
  };

  const niScope = scopePaneRaw({
    id: "ns-scope-ni",
    x: LAYOUT.scope.x + 70,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 100,
    height: LAYOUT.scope.h - 26,
    tMax: scopeT,
    samples: 900,
    xLabel: "time",
    planes: [
      {
        label: "v_in",
        yMin: -niAxis,
        yMax: niAxis,
        yTicks: [-Vni, 0, Vni],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "in", fn: vni, color: theme.palette.primary, start: T_NI_RUN, duration: RUN, strokeWidth: 2.5 }],
      },
      {
        label: "v_out",
        yMin: -niAxis,
        yMax: niAxis,
        yTicks: [-gainNi * Vni, 0, gainNi * Vni],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "out", fn: (t) => gainNi * vni(t), color: theme.palette.accent, start: T_NI_RUN, duration: RUN, strokeWidth: 2.5 }],
      },
    ],
    ...th,
  });
  const niVtc = xyCurvePane({
    id: "ns-vtc-ni",
    x: LAYOUT.transfer.x + 76,
    y: LAYOUT.transfer.y + 14,
    width: LAYOUT.transfer.w - 116,
    height: LAYOUT.transfer.h - 66,
    xMin: -Vni * 1.12,
    xMax: Vni * 1.12,
    yMin: -niAxis,
    yMax: niAxis,
    xTicks: [-Vni, 0, Vni],
    yTicks: [-gainNi * Vni, 0, gainNi * Vni],
    xTickLabel: (v) => `${v} V`,
    yTickLabel: (v) => `${v} V`,
    xLabel: "v_in",
    yLabel: "v_out",
    uMax: scopeT,
    samples: 200,
    traces: [
      {
        id: "line",
        at: (u) => {
          const x = -Vni * 1.12 + (2 * Vni * 1.12 * u) / scopeT;
          return { x, y: gainNi * x };
        },
        color: theme.palette.accent,
        strokeWidth: 3,
        start: T_NI_RUN,
        duration: 1,
        label: `slope +${gainNi}: in phase`,
      },
    ],
    dots: [
      {
        id: "dot",
        at: (u) => ({ x: vni(u), y: gainNi * vni(u) }),
        color: theme.palette.accent,
        start: T_NI_RUN,
        duration: RUN,
        until: T_SUM,
      },
    ],
    ...th,
  });
  const niRun: Beat = {
    at: T_NI_RUN,
    dur: RUN,
    say: `The gain is one plus R f over R g, so ${gainNi}. Notice the output rises when the input rises — the line has a positive slope. This stage cannot invert, and it cannot have a gain below one.`,
    nodes: [withTracks(niScope.node, fadeBetween(T_NI_RUN - 0.5, T_SUM)), withTracks(niVtc.node, fadeBetween(T_NI_RUN - 0.5, T_SUM))],
  };

  /* ------------------------------------------------------- half two: summing */
  const sumSch = summingStage({
    id: "ns-sch-sum",
    x: 0,
    y: 0,
    current: true,
    feedbackLabel: `R_f = ${fmtR(Rf)}`,
    inputs: [
      { label: `R_1 = ${fmtR(R1)}`, terminal: "v_1" },
      { label: `R_2 = ${fmtR(R2)}`, terminal: "v_2" },
    ],
    ...th,
  });
  const sumBeat: Beat = {
    at: T_SUM,
    dur: 5,
    say: "Now the summing amplifier: the inverting stage, with two inputs instead of one. Each has its own resistor into the same node, and that node is held at zero volts no matter what.",
    nodes: [
      withTracks(
        {
          id: "ns-sch-sum-g",
          type: "group",
          x: LAYOUT.schematic.x + 46,
          y: LAYOUT.schematic.y + 46,
          scale: 0.8,
          children: [sumSch.node],
        },
        fade(T_SUM),
      ),
      equationPane({
        id: "ns-eq-sum",
        latex: "\\frac{v_1}{R_1}+\\frac{v_2}{R_2}=-\\frac{v_{out}}{R_f}",
        x: eqX,
        y: LAYOUT.equation.y + 6,
        at: T_SUM + 0.5,
        size: 24,
        ...th,
      }).node,
      equationPane({
        id: "ns-eq-weights",
        latex: "v_{out}=-\\left(\\frac{R_f}{R_1}v_1+\\frac{R_f}{R_2}v_2\\right)",
        x: eqX,
        y: LAYOUT.equation.y + 90,
        at: T_SUM + 2,
        size: 24,
        color: theme.palette.accent,
        ...th,
      }).node,
      {
        id: "ns-ctr-w1",
        type: "counter",
        x: eqX,
        y: LAYOUT.equation.y + 190,
        value: w1,
        decimals: 1,
        prefix: "weight on v_1 = ",
        fontFamily: LABEL_FONT,
        fontSize: 22,
        fill: theme.palette.primary,
        align: "left",
        baseline: "middle",
        tracks: fade(T_SUM + 2),
      },
      {
        id: "ns-ctr-w2",
        type: "counter",
        x: eqX,
        y: LAYOUT.equation.y + 228,
        value: w2,
        decimals: 1,
        prefix: "weight on v_2 = ",
        fontFamily: LABEL_FONT,
        fontSize: 22,
        fill: theme.palette.secondary,
        align: "left",
        baseline: "middle",
        tracks: fade(T_SUM + 2.5),
      },
    ],
  };

  const vPlane = (label: string, id: string, fn: (t: number) => number, color: string) => ({
    label,
    yMin: -sumAxis,
    yMax: sumAxis,
    yTicks: [-2, 0, 2],
    yTickLabel: (v: number) => `${v} V`,
    traces: [{ id, fn, color, start: T_SUM_RUN, duration: RUN, strokeWidth: 2.5 }],
  });
  const sumScope = scopePaneRaw({
    id: "ns-scope-sum",
    x: LAYOUT.scope.x + 70,
    y: LAYOUT.scope.y + 6,
    width: LAYOUT.scope.w - 100,
    height: LAYOUT.scope.h - 22,
    tMax: scopeT,
    samples: 900,
    xLabel: "time",
    planes: [
      vPlane("v_1  (slow)", "v1", v1, theme.palette.primary),
      vPlane("v_2  (fast)", "v2", v2, theme.palette.secondary),
      vPlane("v_out", "out", vsum, theme.palette.accent),
    ],
    ...th,
  });

  /** Each input's own line: with the other input at zero, v_out is just that weight times it. */
  const sumX = sumAxis / w2;
  const weightLine = (weight: number) => (u: number) => {
    const x = -sumX + (2 * sumX * u) / scopeT;
    return { x, y: -weight * x };
  };
  const sumVtc = xyCurvePane({
    id: "ns-vtc-sum",
    x: LAYOUT.transfer.x + 76,
    y: LAYOUT.transfer.y + 14,
    width: LAYOUT.transfer.w - 116,
    height: LAYOUT.transfer.h - 66,
    xMin: -sumX,
    xMax: sumX,
    yMin: -sumAxis,
    yMax: sumAxis,
    xTicks: [-1, 0, 1],
    yTicks: [-2, 0, 2],
    xTickLabel: (v) => `${v} V`,
    yTickLabel: (v) => `${v} V`,
    xLabel: "one input, with the other at zero",
    yLabel: "v_out",
    legendAt: "bottom",
    uMax: scopeT,
    samples: 200,
    traces: [
      {
        id: "l1",
        at: weightLine(w1),
        color: theme.palette.primary,
        strokeWidth: 3,
        start: T_SUM_RUN,
        duration: 1,
        label: `slope −${w1} for v_1`,
      },
      {
        id: "l2",
        at: weightLine(w2),
        color: theme.palette.secondary,
        strokeWidth: 3,
        start: T_SUM_RUN + 0.4,
        duration: 1,
        label: `slope −${w2} for v_2`,
      },
    ],
    dots: [
      { id: "d1", at: (u) => ({ x: v1(u), y: -w1 * v1(u) }), color: theme.palette.primary, start: T_SUM_RUN, duration: RUN },
      { id: "d2", at: (u) => ({ x: v2(u), y: -w2 * v2(u) }), color: theme.palette.secondary, start: T_SUM_RUN, duration: RUN },
    ],
    ...th,
  });
  const sumRun: Beat = {
    at: T_SUM_RUN,
    dur: RUN,
    say: `A slow one volt into R 1, and a fast half volt into R 2 — but R 2 is half the resistance, so it carries twice the weight. The bottom trace is the sum: one times the slow wave plus two times the fast one, inverted.`,
    nodes: [withTracks(sumScope.node, fade(T_SUM_RUN - 0.5)), withTracks(sumVtc.node, fade(T_SUM_RUN - 0.5))],
  };

  const note: Node = {
    id: "ns-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 14,
    text: "Each input sees only its own resistor, because the node never moves.",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 17,
    fill: theme.palette.text,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w + 40,
    tracks: fade(T_NOTE),
  };
  const noteBeat: Beat = {
    at: T_NOTE,
    dur: 4,
    say: "Each input sees only its own resistor, because the node it drives never moves. Change one input and the others do not care — which is why this circuit adds instead of interfering.",
    nodes: [note],
  };

  return eeLesson({
    title: "Non-inverting and summing: two more stages, same two rules",
    beats: [niBeat, niRun, sumBeat, sumRun, noteBeat],
    ...th,
  });
}
