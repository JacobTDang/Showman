/**
 * ee.halfWaveRectifier — one diode, and half of the wave is gone.
 *
 * The brief that opened issue #121, done properly. A freehand attempt at it produced a
 * drawing whose wires stopped short of the parts and whose diode was never shown doing
 * anything. Here the loop is lit only while the diode is forward biased: for a little over
 * half of each cycle the current marches round and the load sees v_in − 0.7 V, and for the
 * rest the loop is dark and the output sits flat at zero.
 *
 * Two output traces are drawn, because they are not the same thing. The solid one is the
 * constant-voltage-drop model, v_in − 0.7 V; the dashed one is the exact solution of the
 * exponential diode against the load line, which is the curve the operating-point dot
 * rides. They differ by seventy millivolts at the peak — the size of the approximation.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, characteristicPane, eeLesson, equationPane, scopePaneRaw, type Beat } from "./kit.js";
import { halfWaveSchematic, type Window } from "./diodeSchematics.js";
import { V_CVD, diodeCurrent, seriesDiode } from "./diodeIV.js";
import { fade, valueTrack, withTracks } from "./util.js";

export interface HalfWaveOptions {
  /** Input amplitude, volts. Default 5. */
  Vp?: number;
  /** Load resistance, ohms. Default 1 kΩ. */
  RL?: number;
  theme?: string;
}

/* ---------------------------------------------------------------- timing */

const T_CIRCUIT = 0.5;
const T_RULE = 6;
const T_RUN = 12;
const RUN = 13;
const T_NAME = 26;
const CYCLES = 3;
/** Mains frequency the circuit is really running at; the scope's timebase is slowed to draw it. */
const F_LINE = 60;

/* ------------------------------------------------------------ waveforms */

export interface HalfWaveWaveforms {
  Vp: number;
  RL: number;
  cycles: number;
  /** Seconds of lesson time the run beat lasts. */
  span: number;
  /** Lesson time the run beat starts. */
  start: number;
  /** One input cycle, in lesson seconds. */
  period: number;
  fLine: number;
  vin(t: number): number;
  /** The constant-voltage-drop model: v_in − 0.7 V when forward biased, else exactly zero. */
  voutModel(t: number): number;
  /** The exact solution of the exponential diode against the load line. */
  vout(t: number): number;
  vD(t: number): number;
  i(t: number): number;
  /** The arcs of lesson time in which the diode conducts. */
  windows: Window[];
  /** Mean of the model output over a whole period. */
  average: number;
}

export function halfWaveWaveforms(o: HalfWaveOptions = {}): HalfWaveWaveforms {
  const Vp = o.Vp ?? 5;
  const RL = o.RL ?? 1000;
  const period = RUN / CYCLES;
  const vin = (t: number) => Vp * Math.sin((2 * Math.PI * t) / period);
  const voutModel = (t: number) => Math.max(0, vin(t) - V_CVD);
  const solve = (t: number) => seriesDiode(vin(t), RL);

  // The conducting arc: sin θ > V_CVD / V_p, once per cycle.
  const theta1 = Math.asin(V_CVD / Vp);
  const windows: Window[] = [];
  for (let k = 0; k < CYCLES; k++) {
    windows.push({
      on: k * period + (theta1 / (2 * Math.PI)) * period,
      off: k * period + ((Math.PI - theta1) / (2 * Math.PI)) * period,
    });
  }

  // The mean of the delivered half sine, by the trapezoid rule over one period.
  const N = 20000;
  let sum = 0;
  for (let k = 0; k < N; k++) sum += voutModel(((k + 0.5) / N) * period);
  const average = sum / N;

  return {
    Vp,
    RL,
    cycles: CYCLES,
    span: RUN,
    start: T_RUN,
    period,
    fLine: F_LINE,
    vin,
    voutModel,
    vout: (t) => solve(t).i * RL,
    vD: (t) => solve(t).v,
    i: (t) => solve(t).i,
    windows,
    average,
  };
}

/* --------------------------------------------------------------- lesson */

export function buildHalfWaveRectifier(o: HalfWaveOptions = {}): SceneSpec {
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const w = halfWaveWaveforms(o);
  const { Vp, RL } = w;
  const peak = Vp - V_CVD;
  const iPeakMa = (w.vout(w.period / 4) / RL) * 1e3;

  // Beat 1 — the circuit. The conduction windows are on the lesson clock, so they are
  // offset by the moment the run beat starts.
  const windows = w.windows.map((win) => ({ on: T_RUN + win.on, off: T_RUN + win.off }));
  const sch = halfWaveSchematic({
    id: "hw-sch",
    x: LAYOUT.schematic.x + 60,
    y: LAYOUT.schematic.y + 20,
    rLabel: `R_L = ${RL / 1000} kΩ`,
    windows,
    span: T_NAME + 10,
    ...th,
  });
  const circuit: Beat = {
    at: T_CIRCUIT,
    dur: 5,
    say: "One diode in series with a load. The source swings both ways; the diode only lets current through one way. That is the whole circuit.",
    nodes: [withTracks(sch.node, fade(T_CIRCUIT))],
  };

  // Beat 2 — the rule.
  const eqX = LAYOUT.equation.x;
  // KaTeX's cases environment produces no drawable nodes in this renderer, so the two
  // branches are two equations, stacked.
  const eqRule = equationPane({
    id: "hw-eq-rule",
    latex: "v_{out}=v_{in}-0.7\\,\\mathrm{V}\\ \\ \\text{while}\\ \\ v_{in}>0.7\\,\\mathrm{V}",
    x: eqX,
    y: LAYOUT.equation.y + 10,
    at: T_RULE,
    size: 22,
    ...th,
  });
  const eqOff = equationPane({
    id: "hw-eq-off",
    latex: "v_{out}=0\\ \\ \\text{otherwise: the diode blocks}",
    x: eqX,
    y: LAYOUT.equation.y + 62,
    at: T_RULE + 1.2,
    size: 22,
    color: theme.palette.muted,
    ...th,
  });
  const rule: Beat = {
    at: T_RULE,
    dur: 5,
    say: "Forward biased, the diode drops zero point seven volts and the rest lands on the load. Reverse biased, no current flows at all, so the load sees nothing.",
    nodes: [eqRule.node, eqOff.node],
  };

  // Beat 3 — the run. Scope, characteristic and the lit loop share the clock.
  const yV = Vp * 1.25;
  const scope = scopePaneRaw({
    id: "hw-scope",
    x: LAYOUT.scope.x + 66,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 86,
    height: LAYOUT.scope.h - 26,
    tMax: RUN,
    xLabel: `${CYCLES} cycles of a ${F_LINE} Hz input`,
    samples: 1600,
    planes: [
      {
        label: "v_in",
        yMin: -yV,
        yMax: yV,
        yTicks: [-Vp, 0, Vp],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "in", fn: w.vin, color: theme.palette.primary, start: T_RUN, duration: RUN, marker: true }],
      },
      {
        label: "v_out",
        yMin: -yV,
        yMax: yV,
        yTicks: [0, Vp],
        yTickLabel: (v) => `${v} V`,
        traces: [
          { id: "out", fn: w.vout, color: theme.palette.accent, start: T_RUN, duration: RUN, marker: true, strokeWidth: 3.5 },
          { id: "model", fn: w.voutModel, color: theme.palette.secondary, start: T_RUN, duration: RUN, strokeWidth: 1.8, dash: [9, 7] },
        ],
      },
    ],
    ...th,
  });

  const iv = characteristicPane({
    id: "hw-iv",
    x: LAYOUT.transfer.x + 78,
    y: LAYOUT.transfer.y + 14,
    width: LAYOUT.transfer.w - 136,
    height: LAYOUT.transfer.h - 60,
    xMin: -Vp - 0.5,
    xMax: 1,
    yMin: -0.7,
    yMax: Math.ceil(iPeakMa) + 0.6,
    xTicks: [-Vp, 0, V_CVD],
    yTicks: [0, Math.ceil(iPeakMa)],
    xTickLabel: (v) => (v === V_CVD ? "0.7 V" : `${v} V`),
    yTickLabel: (v) => `${v} mA`,
    xLabel: "v_D",
    yLabel: "i_D",
    curves: [
      { id: "exp", fn: (v) => diodeCurrent(v) * 1e3, color: theme.palette.primary, strokeWidth: 3, samples: 700 },
      {
        id: "knee",
        points: [
          { x: V_CVD, y: 0 },
          { x: V_CVD, y: Math.ceil(iPeakMa) + 0.6 },
        ],
        color: theme.palette.secondary,
        dash: [7, 5],
        strokeWidth: 2,
      },
    ],
    dots: [
      {
        id: "hw-iv-dot",
        traj: (t) => ({ x: w.vD(t), y: w.i(t) * 1e3 }),
        tMax: RUN,
        start: T_RUN,
        duration: RUN,
        color: theme.palette.accent,
        radius: 7,
      },
    ],
    ...th,
  });

  const ctrY = LAYOUT.equation.y + 150;
  const counters: Node[] = [
    {
      id: "hw-ctr-vin",
      type: "counter",
      x: eqX,
      y: ctrY,
      value: 0,
      decimals: 2,
      prefix: "v_in = ",
      suffix: " V",
      fontFamily: LABEL_FONT,
      fontSize: 22,
      fill: theme.palette.primary,
      align: "left",
      baseline: "middle",
      tracks: [valueTrack(w.vin, T_RUN, RUN, 260), ...fade(T_RUN)],
    },
    {
      id: "hw-ctr-vout",
      type: "counter",
      x: eqX + 210,
      y: ctrY,
      value: 0,
      decimals: 2,
      prefix: "v_out = ",
      suffix: " V",
      fontFamily: LABEL_FONT,
      fontSize: 22,
      fill: theme.palette.accent,
      align: "left",
      baseline: "middle",
      tracks: [valueTrack(w.vout, T_RUN, RUN, 260), ...fade(T_RUN)],
    },
  ];
  // Level with the scope's own plane labels, starting right of them.
  const legend = (id: string, x: number, align: "left" | "right", text: string, fill: string): Node => ({
    id,
    type: "text",
    x,
    y: LAYOUT.scope.y - 6,
    text,
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 13,
    fill,
    align,
    baseline: "middle",
    tracks: fade(T_RUN - 0.5),
  });
  const runBeat: Beat = {
    at: T_RUN,
    dur: RUN,
    say: "Watch the loop. While the input is above zero point seven volts the current marches and the output follows it, seven tenths of a volt lower. The moment the input falls below that, the loop goes dark and the output is flat zero for the whole negative half.",
    nodes: [
      withTracks(scope.node, fade(T_RUN - 0.5)),
      withTracks(iv.node, fade(T_RUN - 0.5)),
      legend("hw-legend-exact", LAYOUT.scope.x + 160, "left", "solid: the exact exponential diode", theme.palette.accent),
      legend("hw-legend-model", LAYOUT.scope.x + LAYOUT.scope.w - 20, "right", "dashed: the 0.7 V model", theme.palette.secondary),
      ...counters,
    ],
  };

  // Beat 4 — name it, and read what it delivers.
  const eqAvg = equationPane({
    id: "hw-eq-avg",
    latex: `V_{peak}=V_p-0.7=${peak.toFixed(1)}\\,\\mathrm{V}\\qquad \\overline{v_{out}}=${w.average.toFixed(2)}\\,\\mathrm{V}`,
    x: eqX,
    y: LAYOUT.equation.y + 205,
    at: T_NAME,
    size: 21,
    color: theme.palette.secondary,
    ...th,
  });
  const note: Node = {
    id: "hw-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 10,
    text: "One polarity survives; half the cycle is thrown away.",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 17,
    fill: theme.palette.text,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w,
    tracks: fade(T_NAME),
  };
  const nameBeat: Beat = {
    at: T_NAME,
    dur: 4.5,
    say: `A half-wave rectifier. The peak at the load is ${peak.toFixed(1)} volts, but the average is only ${w.average.toFixed(2)}, because half of every cycle delivers nothing.`,
    nodes: [eqAvg.node, note],
  };

  return eeLesson({
    title: "Half-wave rectifier: the diode conducts one way only",
    beats: [circuit, rule, runBeat, nameBeat],
    ...th,
  });
}
