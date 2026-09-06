/**
 * ee.diodeIV — the diode's i–v curve, and why everyone draws it as 0.7 volts.
 *
 * A resistor's characteristic is a straight line through the origin; a diode's is an
 * exponential that is flat for a volt of reverse bias and then turns almost vertical
 * within a tenth of a volt. Sweep the voltage across it and the current climbs from a
 * fraction of a nanoamp to milliamps — six decades — which is why the scope's current
 * axis here is logarithmic, and why the curve looks like a knee on a linear one.
 *
 * The model this whole tier is built on lives here, because this is the lesson that
 * derives it: the Shockley equation with the constants named, and the constant-voltage-
 * drop approximation drawn on top of it.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, characteristicPane, eeLesson, equationPane, scopePaneRaw, type Beat } from "./kit.js";
import { diodeTestSchematic } from "./diodeSchematics.js";
import { fade, fadeBetween, fmtR, valueTrack, withTracks } from "./util.js";

/**
 * A silicon rectifier at room temperature, in the shape Sedra/Smith writes it.
 *
 * V_T = kT/q ≈ 25.9 mV at 300 K. n = 1.8 is the emission coefficient of a large-junction
 * power rectifier such as the 1N4006 the EE 230 lab uses — small-signal diodes sit nearer
 * 1. I_S is then fixed by the one number a student is ever asked to remember: the knee at
 * 0.7 V should be about a milliamp. 0.30 nA puts it at 0.996 mA.
 */
export const SILICON = { IS: 3.0e-10, n: 1.8, VT: 0.0259 } as const;

/** The constant-voltage-drop model: on at 0.7 V, off below it. */
export const V_CVD = 0.7;

const NVT = SILICON.n * SILICON.VT;

/** The Shockley equation: i = I_S(e^{v/nV_T} − 1). Reverse bias saturates at −I_S. */
export function diodeCurrent(v: number): number {
  return SILICON.IS * (Math.exp(v / NVT) - 1);
}

/** Its inverse, for a forward current: v = nV_T ln(i/I_S + 1). */
export function diodeVoltage(i: number): number {
  return NVT * Math.log(Math.max(i / SILICON.IS + 1, Number.MIN_VALUE));
}

/**
 * The operating point of a source driving a diode through a series resistance: the one
 * v_D at which the diode's exponential and the resistor's load line agree. v_D + i(v_D)·R
 * increases strictly with v_D, so bisection finds it without ever needing a derivative,
 * and 100 halvings of a 7-volt bracket are far beyond double precision.
 */
export function seriesDiode(vSource: number, R: number): { v: number; i: number } {
  let lo = Math.min(-1, vSource) - 1;
  let hi = 1.5;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (mid + diodeCurrent(mid) * R < vSource) lo = mid;
    else hi = mid;
  }
  const v = (lo + hi) / 2;
  return { v, i: diodeCurrent(v) };
}

export interface DiodeIVOptions {
  /** Series resistance in the test circuit, ohms. Default 1 kΩ. */
  R?: number;
  theme?: string;
}

/* ------------------------------------------------------------ the lesson */

const T_CIRCUIT = 0.5;
const T_EQ = 6;
const T_SWEEP = 11.5;
const SWEEP = 12;
const T_CVD = 24.5;
const T_NOTE = 29.5;

const V_MIN = -1;
const V_MAX = 0.8;
/** Milliamps at the top of the current axis. */
const I_MAX_MA = 10;

export function buildDiodeIV(o: DiodeIVOptions = {}): SceneSpec {
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const R = o.R ?? 1000;
  const ink = theme.palette.text;

  /** The swept diode voltage, on the lesson clock. */
  const drive = (t: number) => V_MIN + ((V_MAX - V_MIN) * Math.min(SWEEP, Math.max(0, t))) / SWEEP;
  /** Current in milliamps as a function of VOLTAGE, for the characteristic. */
  const mA = (v: number) => diodeCurrent(v) * 1e3;
  /** Decades of current as a function of TIME, for the scope. Reverse bias floors at 0.1 nA. */
  const logI = (t: number) => Math.log10(Math.max(diodeCurrent(drive(t)), 1e-10));

  // Beat 1 — the test circuit.
  const sch = diodeTestSchematic({
    id: "dv-sch",
    x: LAYOUT.schematic.x + 100,
    y: LAYOUT.schematic.y + 20,
    rLabel: `R = ${fmtR(R)}`,
    ...th,
  });
  const circuit: Beat = {
    at: T_CIRCUIT,
    dur: 5,
    say: "A diode conducts one way. Here it is in series with a resistor: sweep the source, and read the voltage across the diode against the current through it.",
    nodes: [withTracks(sch.node, fade(T_CIRCUIT))],
  };

  // Beat 2 — the equation and its constants.
  const eqX = LAYOUT.equation.x;
  const eqShockley = equationPane({
    id: "dv-eq-shockley",
    latex: "i_D = I_S\\left(e^{\\,v_D/nV_T}-1\\right)",
    x: eqX,
    y: LAYOUT.equation.y + 10,
    at: T_EQ,
    size: 26,
    ...th,
  });
  const eqParams = equationPane({
    id: "dv-eq-params",
    latex: "I_S=0.30\\,\\mathrm{nA}\\qquad n=1.8\\qquad V_T=25.9\\,\\mathrm{mV}",
    x: eqX,
    y: LAYOUT.equation.y + 72,
    at: T_EQ + 1.2,
    size: 19,
    color: theme.palette.muted,
    ...th,
  });
  const equation: Beat = {
    at: T_EQ,
    dur: 4,
    say: "The current is exponential in the voltage. Three constants set it: the saturation current, the emission coefficient, and the thermal voltage, twenty-six millivolts at room temperature.",
    nodes: [eqShockley.node, eqParams.node],
  };

  // Beat 3 — the sweep. Scope and characteristic on one clock.
  const scope = scopePaneRaw({
    id: "dv-scope",
    x: LAYOUT.scope.x + 68,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 88,
    height: LAYOUT.scope.h - 26,
    tMax: SWEEP,
    xLabel: "the sweep",
    samples: 900,
    planes: [
      {
        label: "v_D",
        yMin: -1.15,
        yMax: 0.95,
        yTicks: [-1, 0, 0.7],
        yTickLabel: (v) => `${v.toFixed(1)} V`,
        traces: [{ id: "v", fn: drive, color: theme.palette.primary, start: T_SWEEP, duration: SWEEP, marker: true }],
      },
      {
        label: "i_D, log scale",
        yMin: -10,
        yMax: -1,
        yTicks: [-9, -6, -3],
        yTickLabel: (v) => (v === -9 ? "1 nA" : v === -6 ? "1 µA" : "1 mA"),
        traces: [{ id: "i", fn: logI, color: theme.palette.accent, start: T_SWEEP, duration: SWEEP, marker: true, strokeWidth: 2.5 }],
      },
    ],
    ...th,
  });

  const iv = characteristicPane({
    id: "dv-iv",
    x: LAYOUT.transfer.x + 72,
    y: LAYOUT.transfer.y + 14,
    width: LAYOUT.transfer.w - 130,
    height: LAYOUT.transfer.h - 60,
    xMin: V_MIN,
    xMax: 0.85,
    yMin: -1.2,
    yMax: I_MAX_MA,
    xTicks: [-1, 0, 0.7],
    yTicks: [0, 5, 10],
    xTickLabel: (v) => `${v} V`,
    yTickLabel: (v) => `${v} mA`,
    xLabel: "v_D",
    yLabel: "i_D",
    curves: [
      { id: "exp", fn: mA, color: theme.palette.primary, strokeWidth: 3, samples: 600 },
      {
        id: "cvd",
        points: [
          { x: V_MIN, y: 0 },
          { x: V_CVD, y: 0 },
          { x: V_CVD, y: I_MAX_MA },
        ],
        color: theme.palette.secondary,
        dash: [7, 5],
        strokeWidth: 2.5,
        at: T_CVD,
      },
    ],
    dots: [{ id: "dv-iv-dot", traj: (t) => ({ x: drive(t), y: mA(drive(t)) }), tMax: SWEEP, start: T_SWEEP, duration: SWEEP }],
    ...th,
  });

  const ctrY = LAYOUT.equation.y + 150;
  const counters: Node[] = [
    {
      id: "dv-ctr-v",
      type: "counter",
      x: eqX,
      y: ctrY,
      value: Number(V_MIN.toFixed(3)),
      decimals: 3,
      prefix: "v_D = ",
      suffix: " V",
      fontFamily: LABEL_FONT,
      fontSize: 22,
      fill: theme.palette.primary,
      align: "left",
      baseline: "middle",
      tracks: [valueTrack(drive, T_SWEEP, SWEEP, 120), ...fade(T_SWEEP)],
    },
    {
      id: "dv-ctr-i-na",
      type: "counter",
      x: eqX + 230,
      y: ctrY,
      value: Number((diodeCurrent(V_MIN) * 1e9).toFixed(3)),
      decimals: 2,
      prefix: "i_D = ",
      suffix: " nA",
      fontFamily: LABEL_FONT,
      fontSize: 22,
      fill: theme.palette.accent,
      align: "left",
      baseline: "middle",
      tracks: [valueTrack((u) => diodeCurrent(drive(u)) * 1e9, T_SWEEP, SWEEP, 120), ...fadeBetween(T_SWEEP, T_SWEEP + 6.5)],
    },
    {
      id: "dv-ctr-i",
      type: "counter",
      x: eqX + 230,
      y: ctrY,
      value: 0,
      decimals: 3,
      prefix: "i_D = ",
      suffix: " mA",
      fontFamily: LABEL_FONT,
      fontSize: 22,
      fill: theme.palette.accent,
      align: "left",
      baseline: "middle",
      tracks: [valueTrack((u) => mA(drive(u)), T_SWEEP, SWEEP, 120), ...fade(T_SWEEP + 7)],
    },
  ];
  const sweepBeat: Beat = {
    at: T_SWEEP,
    dur: SWEEP,
    say: "Sweep from one volt of reverse bias upward. For most of the sweep the current is a fraction of a nanoamp — nothing. Past half a volt it climbs a decade for every hundred millivolts, and by seven tenths of a volt it is a milliamp. On the linear plot that looks like a knee.",
    nodes: [withTracks(scope.node, fade(T_SWEEP - 0.5)), withTracks(iv.node, fade(T_SWEEP - 0.5)), ...counters],
  };

  // Beat 4 — the model everybody actually uses.
  const eqCvd = equationPane({
    id: "dv-eq-cvd",
    latex: "\\text{on: } v_D \\approx 0.7\\,\\mathrm{V} \\qquad \\text{off: } i_D = 0",
    x: eqX,
    y: LAYOUT.equation.y + 210,
    at: T_CVD,
    size: 24,
    color: theme.palette.secondary,
    ...th,
  });
  const cvdBeat: Beat = {
    at: T_CVD,
    dur: 5,
    say: "Because the curve is so steep, the diode's voltage barely moves once it is on. So we replace the exponential with two straight lines: off below zero point seven volts, and a fixed zero point seven volt drop above it.",
    nodes: [eqCvd.node],
  };

  const note: Node = {
    id: "dv-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 10,
    text: `1 mA to ${mA(0.8).toFixed(0)} mA, and the drop moves only ${((0.8 - V_CVD) * 1000).toFixed(0)} mV.`,
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 16,
    fill: ink,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w,
    tracks: fade(T_NOTE),
  };
  const noteBeat: Beat = {
    at: T_NOTE,
    dur: 4,
    say: `From one milliamp to ${mA(0.8).toFixed(0)}, the drop moves a hundred millivolts. Zero point seven volts is close enough.`,
    nodes: [note],
  };

  return eeLesson({
    title: "The diode i–v curve, and the 0.7 volt model",
    beats: [circuit, equation, sweepBeat, cvdBeat, noteBeat],
    ...th,
  });
}
