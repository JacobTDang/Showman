/**
 * ee.relaxationOscillator — the Schmitt trigger wired to feed itself.
 *
 * Take the Schmitt trigger, throw the signal generator away, and let the output charge a
 * capacitor through a resistor back into the − terminal. Now the input is the circuit's own
 * past output. The capacitor heads for whichever rail the output is on; when it arrives at
 * that rail's threshold the Schmitt flips; the rail reverses and the capacitor turns round.
 * It never gets anywhere near the rail it is aiming at, which is why the sawtooth is the
 * first, straightest-looking slice of an exponential rather than a curve that flattens out.
 *
 * The period is the time one of those slices takes, twice. Starting at V_TL and heading for
 * +V_sat, v_C(t) = V_sat + (V_TL − V_sat)·e^{−t/RC}; set that equal to V_TH and the algebra
 * collapses to a half period of RC·ln((1+β)/(1−β)), so
 *
 *     T = 2 RC ln((1 + β)/(1 − β)),   β = R_1/(R_1 + R_2)
 *
 * with V_sat cancelling out entirely: the frequency does not depend on the supply. The
 * capacitor waveform here is not drawn from that formula, though. It is integrated forward
 * one exponential step at a time and switched when it actually reaches a threshold, so the
 * period the scope shows is a measurement of the drawing, and the test that compares it with
 * the formula is a real test rather than a tautology.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, xyCurvePane, type Beat } from "./kit.js";
import { relaxationStage } from "./comparatorSchematics.js";
import { COMPARATOR } from "./comparator.js";
import { SCHMITT } from "./schmittTrigger.js";
import { fade, fmtC, fmtR, fmtTau, withTracks } from "./util.js";

const R = 10e3;
const C = 10e-9;

export const RELAXATION = {
  /** Timing resistor, ohms. */
  R,
  /** Timing capacitor, farads. */
  C,
  /** RC, seconds. */
  tau: R * C,
  /** The period the formula gives, seconds. */
  period: 2 * R * C * Math.log((1 + SCHMITT.beta) / (1 - SCHMITT.beta)),
  /** Seconds on the scope's time axis: just under three periods. */
  tMax: 480e-6,
  /** Samples across that window. */
  samples: 2400,
  /** Capacitor-plane half-range, volts. */
  vcAxis: 8,
  /** Output-plane half-range, volts. */
  voutAxis: 16,
};

export interface Solved {
  /** Capacitor voltage on the solver's grid. */
  vc: Float64Array;
  /** Output voltage on the same grid. */
  vout: Float64Array;
  /** Read the capacitor back as a function of time. */
  vcAt(t: number): number;
  /** Read the output back as a function of time. */
  voutAt(t: number): number;
}

/**
 * Integrate the oscillator forward.
 *
 * Each step advances the capacitor by the exact exponential over dt toward whichever rail
 * the output is on — no small-signal linearisation — and flips the output the first step
 * the capacitor is past the live threshold. The period is therefore an emergent property of
 * the drawing, quantised only by dt, which is 20 ns against a 162 µs period.
 */
export function solveOscillator(opts: {
  R: number;
  C: number;
  vSat: number;
  vTh: number;
  vTl: number;
  tMax: number;
  steps?: number;
}): Solved {
  const steps = opts.steps ?? 24_000;
  const dt = opts.tMax / steps;
  const decay = Math.exp(-dt / (opts.R * opts.C));
  const vc = new Float64Array(steps + 1);
  const vout = new Float64Array(steps + 1);
  let high = true;
  // The capacitor starts at the threshold it would have just been flipped at, so the very
  // first slice on the screen is a whole half period and nothing has to settle first.
  let v = opts.vTl;
  for (let i = 0; i <= steps; i++) {
    vc[i] = v;
    vout[i] = high ? opts.vSat : -opts.vSat;
    const target = high ? opts.vSat : -opts.vSat;
    v = target + (v - target) * decay;
    if (high && v >= opts.vTh) high = false;
    else if (!high && v <= opts.vTl) high = true;
  }
  const read = (a: Float64Array) => (t: number) => a[Math.max(0, Math.min(steps, Math.round((t / opts.tMax) * steps)))]!;
  return { vc, vout, vcAt: read(vc), voutAt: read(vout) };
}

export interface RelaxationOscillatorOptions {
  /** Timing resistor, ohms. Default 10 kΩ. */
  R?: number;
  /** Timing capacitor, farads. Default 10 nF. */
  C?: number;
  theme?: string;
}

const T_CIRCUIT = 0.5;
const T_MECH = 6;
const T_RUN = 12.5;
const T_PERIOD = 22.5;
const T_NOTE = 29.5;
const RUN = 9;

export function buildRelaxationOscillator(o: RelaxationOscillatorOptions = {}): SceneSpec {
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const r = o.R ?? RELAXATION.R;
  const c = o.C ?? RELAXATION.C;
  const { vSat } = COMPARATOR;
  const { vTh, vTl, beta } = SCHMITT;
  const tau = r * c;
  const period = 2 * tau * Math.log((1 + beta) / (1 - beta));
  const tMax = RELAXATION.tMax;
  const samples = RELAXATION.samples;
  const sol = solveOscillator({ R: r, C: c, vSat, vTh, vTl, tMax });
  /** Microseconds, which is what the axis and both counters are in. */
  const us = (t: number) => t * 1e6;

  /* ---------------------------------------------------------------- schematic */
  const sch = relaxationStage({
    id: "ro-sch",
    x: LAYOUT.schematic.x + 90,
    y: LAYOUT.schematic.y + 14,
    current: true,
    r1Label: `R_1 = ${fmtR(SCHMITT.R1)}`,
    r2Label: `R_2 = ${fmtR(SCHMITT.R2)}`,
    rLabel: `R = ${fmtR(r)}`,
    cLabel: `C = ${fmtC(c)}`,
    ...th,
  });
  const noInput: Node = {
    id: "ro-noinput",
    type: "text",
    x: LAYOUT.schematic.x + LAYOUT.schematic.w / 2,
    y: LAYOUT.schematic.y + LAYOUT.schematic.h + 6,
    text: "No input terminal anywhere: the output is the only source in the circuit.",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 16,
    fill: theme.palette.secondary,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.schematic.w,
    tracks: fade(T_CIRCUIT + 2),
  };

  /* -------------------------------------------------------------------- scope */
  const scope = scopePaneRaw({
    id: "ro-scope",
    x: LAYOUT.scope.x + 82,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 112,
    height: LAYOUT.scope.h - 26,
    tMax,
    samples,
    xLabel: "time (µs)",
    planes: [
      {
        label: "v_C",
        yMin: -RELAXATION.vcAxis,
        yMax: RELAXATION.vcAxis,
        yTicks: [vTl, 0, vTh],
        yTickLabel: (v) => `${v} V`,
        traces: [
          { id: "th", fn: () => vTh, color: theme.palette.secondary, dash: [7, 5], strokeWidth: 2 },
          { id: "tl", fn: () => vTl, color: theme.palette.secondary, dash: [7, 5], strokeWidth: 2 },
          { id: "vc", fn: sol.vcAt, color: theme.palette.primary, start: T_RUN, duration: RUN, strokeWidth: 2.5 },
        ],
      },
      {
        label: "v_out",
        yMin: -RELAXATION.voutAxis,
        yMax: RELAXATION.voutAxis,
        yTicks: [-vSat, 0, vSat],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "out", fn: sol.voutAt, color: theme.palette.accent, start: T_RUN, duration: RUN, strokeWidth: 2.5 }],
      },
    ],
    ...th,
  });
  const vcPlane = scope.planes[0]!;
  const outPlane = scope.planes[1]!;
  const scopeX = LAYOUT.scope.x + 82;
  const scopeY = LAYOUT.scope.y + 8;
  const planeH = vcPlane.toLocal(0, -RELAXATION.vcAxis).y;
  const atTime = (t: number) => scopeX + vcPlane.originX + vcPlane.toLocal(t, 0).x;
  /** One period on the screen, marked between two flips of the same direction. */
  const markA = period / 2;
  const markB = markA + period;
  const marker = (id: string, t: number): Node => ({
    id,
    type: "polyline",
    x: 0,
    y: 0,
    points: [
      { x: atTime(t), y: scopeY + vcPlane.originY },
      { x: atTime(t), y: scopeY + outPlane.originY + planeH },
    ],
    stroke: theme.palette.primary,
    strokeWidth: 2,
    dash: [6, 4],
    tracks: fade(T_PERIOD),
  });
  const periodLabel: Node = {
    id: "ro-period-label",
    type: "text",
    // Over the two markers, above the scope: inside the box the sawtooth peaks are in the way.
    x: (atTime(markA) + atTime(markB)) / 2,
    y: LAYOUT.scope.y - 20,
    text: `one period T = ${us(period).toFixed(1)} µs`,
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 16,
    fill: theme.palette.primary,
    align: "center",
    baseline: "middle",
    tracks: fade(T_PERIOD + 0.3),
  };

  /* ------------------------------------------------------------ transfer view */
  /**
   * The oscillator's operating point never leaves the loop, so the loop is drawn only over
   * the stretch of v_C the capacitor actually visits: a rectangle exactly V_TH − V_TL wide.
   */
  const loop = (u: number) => {
    const s = u / tMax;
    if (s < 0.4) return { x: vTl + ((vTh - vTl) * s) / 0.4, y: vSat };
    if (s < 0.5) return { x: vTh, y: vSat - (2 * vSat * (s - 0.4)) / 0.1 };
    if (s < 0.9) return { x: vTh - ((vTh - vTl) * (s - 0.5)) / 0.4, y: -vSat };
    return { x: vTl, y: -vSat + (2 * vSat * (s - 0.9)) / 0.1 };
  };
  const vtc = xyCurvePane({
    id: "ro-vtc",
    x: LAYOUT.transfer.x + 82,
    y: LAYOUT.transfer.y + 14,
    width: LAYOUT.transfer.w - 122,
    height: LAYOUT.transfer.h - 66,
    xMin: -SCHMITT.vAxis,
    xMax: SCHMITT.vAxis,
    yMin: -RELAXATION.voutAxis,
    yMax: RELAXATION.voutAxis,
    xTicks: [vTl, 0, vTh],
    yTicks: [-vSat, 0, vSat],
    xTickLabel: (v) => `${v} V`,
    yTickLabel: (v) => `${v} V`,
    xLabel: "v_C",
    yLabel: "v_out",
    legendAt: "bottom",
    uMax: tMax,
    samples: 800,
    traces: [{ id: "loop", at: loop, color: theme.palette.accent, strokeWidth: 3, start: T_RUN, duration: 3 }],
    dots: [{ id: "dot", at: (u) => ({ x: sol.vcAt(u), y: sol.voutAt(u) }), color: theme.palette.primary, start: T_RUN, duration: RUN }],
    ...th,
  });

  /** A caption inside the loop, where neither rail nor edge is ever drawn. */
  const vtcLegend: Node = {
    id: "ro-vtc-legend",
    type: "text",
    x: LAYOUT.transfer.x + 82 + vtc.plane.toLocal(0, 4).x,
    y: LAYOUT.transfer.y + 14 + vtc.plane.toLocal(0, 4).y,
    text: "the same loop, walked forever",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 14,
    fill: theme.palette.accent,
    align: "center",
    baseline: "middle",
    tracks: fade(T_RUN + 2),
  };

  /* ---------------------------------------------------------------- equations */
  const eqX = LAYOUT.equation.x;
  const eqY = LAYOUT.equation.y;
  const counter = (
    id: string,
    y: number,
    value: number,
    prefix: string,
    suffix: string,
    decimals: number,
    fill: string,
    at: number,
  ): Node => ({
    id,
    type: "counter",
    x: eqX,
    y,
    value,
    decimals,
    prefix,
    suffix,
    fontFamily: LABEL_FONT,
    fontSize: 26,
    fill,
    align: "left",
    baseline: "middle",
    tracks: fade(at),
  });

  /* -------------------------------------------------------------------- beats */
  const circuit: Beat = {
    at: T_CIRCUIT,
    dur: 5,
    say: "The same Schmitt trigger, with the signal generator thrown away. The output charges a capacitor through a resistor, and the capacitor is the input.",
    nodes: [withTracks(sch.node, fade(T_CIRCUIT)), noInput],
  };

  const mech: Beat = {
    at: T_MECH,
    dur: 6,
    say: `The capacitor heads for whichever rail the output is on. It only ever gets as far as the threshold before the output flips and it has to turn round, so it never reaches ${vSat} volts at all.`,
    nodes: [
      equationPane({
        id: "ro-eq-vc",
        latex: "v_C(t)=V_{sat}+(V_{TL}-V_{sat})\\,e^{-t/RC}",
        x: eqX,
        y: eqY + 6,
        at: T_MECH,
        size: 24,
        ...th,
      }).node,
      {
        id: "ro-tau",
        type: "text",
        x: eqX,
        y: eqY + 86,
        text: `RC = ${fmtR(r)} × ${fmtC(c)} = ${fmtTau(tau)}`,
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 19,
        fill: theme.palette.text,
        align: "left",
        baseline: "middle",
        tracks: fade(T_MECH + 1.6),
      },
    ],
  };

  const run: Beat = {
    at: T_RUN,
    dur: RUN + 1,
    say: "Up to the upper threshold, flip, down to the lower one, flip back. A sawtooth on the capacitor and a square wave out, and the operating point walks the same hysteresis loop over and over.",
    nodes: [withTracks(scope.node, fade(T_RUN - 0.5)), withTracks(vtc.node, fade(T_RUN - 0.5)), vtcLegend],
  };

  const periodBeat: Beat = {
    at: T_PERIOD,
    dur: 6.5,
    say: `Set the exponential equal to the threshold and the rails cancel out. The period is two R C times the log of one plus beta over one minus beta: ${us(period).toFixed(0)} microseconds, or ${(1 / period / 1000).toFixed(2)} kilohertz.`,
    nodes: [
      marker("ro-mark-a", markA),
      marker("ro-mark-b", markB),
      periodLabel,
      equationPane({
        id: "ro-eq-period",
        latex: "T=2RC\\,\\ln\\!\\left(\\frac{1+\\beta}{1-\\beta}\\right)",
        x: eqX,
        y: eqY + 130,
        at: T_PERIOD,
        size: 27,
        color: theme.palette.accent,
        ...th,
      }).node,
      counter("ro-ctr-period", eqY + 218, us(period), "T = ", " µs", 1, theme.palette.accent, T_PERIOD + 1.6),
      counter("ro-ctr-freq", eqY + 262, 1 / period / 1000, "f = ", " kHz", 2, theme.palette.primary, T_PERIOD + 2.1),
    ],
  };

  const note: Beat = {
    at: T_NOTE,
    dur: 5,
    say: "The supply voltage is nowhere in that formula. Change the rails and the square wave gets taller, not faster.",
    nodes: [
      {
        id: "ro-note",
        type: "text",
        x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
        y: LAYOUT.transfer.y + LAYOUT.transfer.h + 14,
        text: "V_sat cancels: the frequency is set by R, C and β, not by the supply.",
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 16,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
        maxWidth: LAYOUT.transfer.w + 40,
        tracks: fade(T_NOTE),
      },
    ],
  };

  return eeLesson({
    title: "The relaxation oscillator: a square wave out of nothing",
    beats: [circuit, mech, run, periodBeat, note],
    ...th,
  });
}
