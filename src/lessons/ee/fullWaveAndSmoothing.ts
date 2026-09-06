/**
 * ee.fullWaveAndSmoothing — the bridge, and then the capacitor that makes it useful.
 *
 * Two ideas, in the order the lab meets them. First the bridge: four diodes so that either
 * polarity of the source reaches the load the same way up. Both halves are delivered, so
 * the output hums at twice the line frequency, and two diodes are always in the path — the
 * load sees |v_in| minus 1.4 V, not 0.7.
 *
 * Then a capacitor across the load. Between peaks nothing recharges it, so it discharges
 * into the load through R_L: the output decays as exp(−t/R_L C) until the rectified input
 * catches it again. What is left is ripple, and the curve here is not drawn to look like
 * that — it is integrated step by step from the ideal model, so the ripple the counter
 * reads is the ripple the trace shows, and the textbook estimate I_L/(f C) can be held up
 * beside it and seen to be a few per cent high.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, characteristicPane, eeLesson, equationPane, scopePaneRaw, type Beat } from "./kit.js";
import { bridgeSchematic, type Window } from "./diodeSchematics.js";
import { V_CVD } from "./diodeIV.js";
import { fade, fadeBetween, fmtC, valueTrack, withTracks } from "./util.js";

export interface FullWaveOptions {
  /** Input amplitude, volts. Default 10. */
  Vp?: number;
  /** Load resistance, ohms. Default 1 kΩ. */
  RL?: number;
  /** Smoothing capacitance, farads. Default 47 µF. */
  C?: number;
  theme?: string;
}

/* ---------------------------------------------------------------- timing */

const T_CIRCUIT = 0.5;
const T_RUN = 6;
const RUN = 10;
const T_CAP = 17;
const T_RIPPLE = 28;
const CYCLES = 4;
const F_LINE = 60;
/** Steps in the discharge integration. 24000 over the window is ~2.8 µs of real time each. */
const STEPS = 24000;
const SCOPE_X = LAYOUT.scope.x + 70;
const SCOPE_Y = LAYOUT.scope.y + 8;

/* ------------------------------------------------------------ waveforms */

export interface FullWaveWaveforms {
  Vp: number;
  RL: number;
  C: number;
  cycles: number;
  span: number;
  /** One input cycle, in lesson seconds. */
  period: number;
  fLine: number;
  /** The ripple frequency: twice the line frequency, because both halves are delivered. */
  fRipple: number;
  /** Real seconds per second of lesson time — the scope's timebase is slowed to draw 60 Hz. */
  timeScale: number;
  /** Load current at the peak, amps. */
  IL: number;
  /** R_L·C, real seconds. */
  tau: number;
  vin(t: number): number;
  /** The bridge output with no capacitor: |v_in| less two diode drops. */
  rect(t: number): number;
  /** The output with the capacitor across the load. */
  smooth(t: number): number;
  /** Peak-to-trough of the smoothed output, measured on the last complete ripple cycle. */
  ripple: number;
  /** I_L/(f C), the small-ripple estimate. */
  formulaRipple: number;
  /** Droop below the most recent peak — the ripple, read live. */
  droop(t: number): number;
  /** Arcs of lesson time in which the bridge is charging, split by input polarity. */
  chargingWindows(): { positive: Window[]; negative: Window[] };
}

export function fullWaveWaveforms(o: FullWaveOptions = {}): FullWaveWaveforms {
  const Vp = o.Vp ?? 10;
  const RL = o.RL ?? 1000;
  const C = o.C ?? 47e-6;
  const period = RUN / CYCLES;
  const timeScale = CYCLES / F_LINE / RUN;
  const tau = RL * C;
  const peak = Vp - 2 * V_CVD;

  const vin = (t: number) => Vp * Math.sin((2 * Math.PI * t) / period);
  const rect = (t: number) => Math.max(0, Math.abs(vin(t)) - 2 * V_CVD);

  // The ideal model, integrated: while the rectified input is above the output the diodes
  // conduct and the output follows it; otherwise the capacitor discharges into the load.
  const dtDraw = RUN / STEPS;
  const decay = Math.exp((-dtDraw * timeScale) / tau);
  const table: number[] = new Array(STEPS + 1);
  let v = 0;
  for (let k = 0; k <= STEPS; k++) {
    const r = rect(k * dtDraw);
    v = k === 0 ? r : Math.max(r, v * decay);
    table[k] = v;
  }
  const smooth = (t: number): number => {
    const u = Math.min(RUN, Math.max(0, t)) / dtDraw;
    const k = Math.min(STEPS - 1, Math.floor(u));
    const f = u - k;
    return Math.max(rect(t), table[k]! + (table[k + 1]! - table[k]!) * f);
  };

  // Peaks of the rectified input, where the capacitor is fullest.
  const peakTimes: number[] = [];
  for (let m = 0; (2 * m + 1) * (period / 4) <= RUN; m++) peakTimes.push((2 * m + 1) * (period / 4));
  const lastPeakAt = (t: number): number | null => {
    let best: number | null = null;
    for (const p of peakTimes) if (p <= t) best = p;
    return best;
  };
  const droop = (t: number): number => {
    const p = lastPeakAt(t);
    return p === null ? 0 : Math.max(0, smooth(p) - smooth(t));
  };

  // Ripple, measured over the last complete cycle between two peaks.
  const from = peakTimes[peakTimes.length - 2] ?? 0;
  const to = peakTimes[peakTimes.length - 1] ?? RUN;
  let ripple = 0;
  for (let k = 0; k <= 4000; k++) ripple = Math.max(ripple, smooth(from) - smooth(from + ((to - from) * k) / 4000));

  const IL = peak / RL;
  const fRipple = 2 * F_LINE;

  const chargingWindows = () => {
    const positive: Window[] = [];
    const negative: Window[] = [];
    let open: number | null = null;
    for (let k = 0; k <= STEPS; k++) {
      const t = k * dtDraw;
      const r = rect(t);
      const charging = r > 0.05 && table[k]! <= r + 1e-9;
      if (charging && open === null) open = t;
      if ((!charging || k === STEPS) && open !== null) {
        const win = { on: open, off: t };
        if (win.off - win.on > 0.02) (vin((win.on + win.off) / 2) > 0 ? positive : negative).push(win);
        open = null;
      }
    }
    return { positive, negative };
  };

  return {
    Vp,
    RL,
    C,
    cycles: CYCLES,
    span: RUN,
    period,
    fLine: F_LINE,
    fRipple,
    timeScale,
    IL,
    tau,
    vin,
    rect,
    smooth,
    ripple,
    formulaRipple: IL / (fRipple * C),
    droop,
    chargingWindows,
  };
}

/* --------------------------------------------------------------- lesson */

export function buildFullWaveAndSmoothing(o: FullWaveOptions = {}): SceneSpec {
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const w = fullWaveWaveforms(o);
  const { Vp, RL, C } = w;
  const peak = Vp - 2 * V_CVD;
  const eqX = LAYOUT.equation.x;

  // Beat 1 — the bridge. The diode pairs light in alternation while it runs; once the
  // capacitor is in, they light only in the short bursts that recharge it.
  const theta1 = Math.asin((2 * V_CVD) / Vp);
  const arc = (k: number, offset: number): Window => ({
    on: k * (w.period / 2) + offset + (theta1 / (2 * Math.PI)) * w.period,
    off: (k + 1) * (w.period / 2) + offset - (theta1 / (2 * Math.PI)) * w.period,
  });
  const runPos: Window[] = [];
  const runNeg: Window[] = [];
  for (let k = 0; k < 2 * CYCLES; k++) (k % 2 === 0 ? runPos : runNeg).push(arc(k, T_RUN));
  const bursts = w.chargingWindows();
  const posWindows = [...runPos, ...bursts.positive.map((b) => ({ on: b.on + T_CAP, off: b.off + T_CAP }))];
  const negWindows = [...runNeg, ...bursts.negative.map((b) => ({ on: b.on + T_CAP, off: b.off + T_CAP }))];

  const sch = bridgeSchematic({
    id: "fw-sch",
    x: LAYOUT.schematic.x + 30,
    y: LAYOUT.schematic.y + 25,
    rLabel: `R_L = ${RL / 1000} kΩ`,
    cLabel: `C = ${fmtC(C)}`,
    capAt: T_CAP,
    posWindows,
    negWindows,
    span: T_RIPPLE + 10,
    ...th,
  });
  const circuit: Beat = {
    at: T_CIRCUIT,
    dur: 5,
    say: "Four diodes in a bridge. Whichever way the source is leaning, two of them carry the current to the load in the same direction — so the load only ever sees one polarity.",
    nodes: [withTracks(sch.node, fade(T_CIRCUIT))],
  };

  // Beats 2 and 3 — the scope: rectified first, then smoothed on the same axis.
  const yIn = Vp * 1.25;
  const scope = scopePaneRaw({
    id: "fw-scope",
    x: SCOPE_X,
    y: SCOPE_Y,
    width: LAYOUT.scope.w - 90,
    height: LAYOUT.scope.h - 26,
    tMax: RUN,
    xLabel: `${CYCLES} cycles of a ${F_LINE} Hz input`,
    samples: 1800,
    planes: [
      {
        label: "v_in",
        yMin: -yIn,
        yMax: yIn,
        yTicks: [-Vp, 0, Vp],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "in", fn: w.vin, color: theme.palette.primary, start: T_RUN, duration: RUN, marker: true }],
      },
      {
        label: "v_out",
        yMin: -0.9,
        yMax: Vp + 0.9,
        yTicks: [0, peak],
        yTickLabel: (v) => `${v.toFixed(1)} V`,
        traces: [
          { id: "rect", fn: w.rect, color: theme.palette.accent, start: T_RUN, duration: RUN, marker: true, strokeWidth: 2.5 },
          { id: "smooth", fn: w.smooth, color: theme.palette.secondary, start: T_CAP, duration: RUN, strokeWidth: 3 },
        ],
      },
    ],
    ...th,
  });
  // The plane's origin is local to the scope's group, so the rules that mark the ripple
  // have to be hung inside a group at the same place — measured off the plane, they would
  // otherwise be drawn across the top-left of the scene.
  const outPlane = scope.planes[1]!;
  const rule = (id: string, level: number): Node => ({
    id,
    type: "polyline",
    x: outPlane.originX,
    y: outPlane.originY,
    points: [outPlane.toLocal(0, level), outPlane.toLocal(RUN, level)],
    stroke: theme.palette.secondary,
    strokeWidth: 1.5,
    dash: [6, 5],
  });
  const rules = (at: number): Node => ({
    id: "fw-rules",
    type: "group",
    x: SCOPE_X,
    y: SCOPE_Y,
    opacity: 0,
    tracks: [
      {
        property: "opacity",
        keyframes: [
          { t: at, value: 0 },
          { t: at + 0.5, value: 1 },
        ],
      },
    ],
    children: [rule("fw-rule-peak", peak), rule("fw-rule-trough", peak - w.ripple)],
  });

  const vtc = characteristicPane({
    id: "fw-vtc",
    x: LAYOUT.transfer.x + 78,
    y: LAYOUT.transfer.y + 14,
    width: LAYOUT.transfer.w - 136,
    height: LAYOUT.transfer.h - 60,
    xMin: -Vp - 1,
    xMax: Vp + 1,
    yMin: -1,
    yMax: Vp,
    xTicks: [-Vp, 0, Vp],
    yTicks: [0, peak],
    xTickLabel: (v) => `${v} V`,
    yTickLabel: (v) => `${v.toFixed(1)} V`,
    xLabel: "v_in",
    yLabel: "v_out",
    curves: [
      { id: "rect", fn: (v) => Math.max(0, Math.abs(v) - 2 * V_CVD), color: theme.palette.accent, strokeWidth: 3, samples: 500 },
      {
        // One steady-state input cycle of (v_in, v_out) with the capacitor in: a closed
        // loop rather than a curve, which is what "not a function of the input" looks like.
        id: "loop-path",
        points: Array.from({ length: 401 }, (_, k) => {
          const t = w.span - w.period + (w.period * k) / 400;
          return { x: w.vin(t), y: w.smooth(t) };
        }),
        color: theme.palette.secondary,
        dash: [6, 5],
        strokeWidth: 2,
        at: T_CAP + 3,
      },
    ],
    dots: [
      { id: "fw-vtc-dot", traj: (t) => ({ x: w.vin(t), y: w.rect(t) }), tMax: RUN, start: T_RUN, duration: RUN },
      {
        id: "fw-vtc-loop",
        traj: (t) => ({ x: w.vin(t), y: w.smooth(t) }),
        tMax: RUN,
        start: T_CAP,
        duration: RUN,
        color: theme.palette.secondary,
        at: T_CAP - 0.3,
      },
    ],
    ...th,
  });

  const eqBridge = equationPane({
    id: "fw-eq-bridge",
    latex: "v_{out}=|v_{in}|-2(0.7)\\,\\mathrm{V}",
    x: eqX,
    y: LAYOUT.equation.y + 14,
    at: T_RUN,
    size: 25,
    ...th,
  });
  const ctrY = LAYOUT.equation.y + 88;
  const ctrOut: Node = {
    id: "fw-ctr-vout",
    type: "counter",
    x: eqX,
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
    // Once the capacitor is in, this counter is reading the wrong curve; hand over to one
    // that reads the smoothed output at the same place on screen.
    tracks: [valueTrack(w.rect, T_RUN, RUN, 240), ...fadeBetween(T_RUN, T_CAP - 0.4, 0.4)],
  };
  const ctrSmooth: Node = {
    ...ctrOut,
    id: "fw-ctr-vout-smooth",
    fill: theme.palette.secondary,
    tracks: [valueTrack(w.smooth, T_CAP, RUN, 240), ...fade(T_CAP)],
  };
  const runBeat: Beat = {
    at: T_RUN,
    dur: RUN,
    say: "Now both halves arrive. The negative half is folded up on top of the positive one, so the output hums at a hundred and twenty hertz — twice the line frequency. Two diodes are always in the path, so the load loses one point four volts, not zero point seven.",
    nodes: [withTracks(scope.node, fade(T_RUN - 0.5)), withTracks(vtc.node, fade(T_RUN - 0.5)), eqBridge.node, ctrOut, ctrSmooth],
  };

  // Beat 3 — the capacitor.
  const ctrRipple: Node = {
    id: "fw-ctr-ripple",
    type: "counter",
    x: eqX + 250,
    y: ctrY,
    value: 0,
    decimals: 2,
    prefix: "ripple = ",
    suffix: " V",
    fontFamily: LABEL_FONT,
    fontSize: 22,
    fill: theme.palette.secondary,
    align: "left",
    baseline: "middle",
    tracks: [valueTrack(w.droop, T_CAP, RUN, 600), ...fade(T_CAP)],
  };
  const note: Node = {
    id: "fw-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 10,
    text: "The dot now traces a loop: the capacitor remembers.",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 16,
    fill: theme.palette.secondary,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w,
    tracks: fade(T_CAP + 3),
  };
  const capBeat: Beat = {
    at: T_CAP,
    dur: RUN,
    say: "Put a capacitor across the load. Each peak charges it, and between peaks nothing does, so it discharges into the load and the output slides down an exponential with time constant R L times C. It never gets far, because the next peak is only eight milliseconds away.",
    nodes: [ctrRipple, note],
  };

  // Beat 4 — the ripple, measured against the estimate.
  const eqRipple = equationPane({
    id: "fw-eq-ripple",
    latex: "V_r \\approx \\frac{I_L}{f\\,C}",
    x: eqX,
    y: LAYOUT.equation.y + 150,
    at: T_RIPPLE,
    size: 26,
    color: theme.palette.secondary,
    ...th,
  });
  const eqNumbers = equationPane({
    id: "fw-eq-numbers",
    latex: `\\frac{${(w.IL * 1e3).toFixed(1)}\\,\\mathrm{mA}}{${w.fRipple}\\,\\mathrm{Hz}\\times ${(C * 1e6).toFixed(0)}\\,\\mu\\mathrm{F}}=${w.formulaRipple.toFixed(2)}\\,\\mathrm{V}\\quad\\text{measured } ${w.ripple.toFixed(2)}\\,\\mathrm{V}`,
    x: eqX,
    y: LAYOUT.equation.y + 215,
    at: T_RIPPLE + 1,
    size: 19,
    ...th,
  });
  const rippleBeat: Beat = {
    at: T_RIPPLE,
    dur: 5,
    say: `Ripple. Load current over ripple frequency times capacitance predicts ${w.formulaRipple.toFixed(2)} volts; the trace measures ${w.ripple.toFixed(2)}. The estimate runs high because it assumes the capacitor discharges for the whole half cycle.`,
    nodes: [eqRipple.node, eqNumbers.node, rules(T_RIPPLE)],
  };

  return eeLesson({
    title: "The bridge rectifier, and the capacitor that smooths it",
    beats: [circuit, runBeat, capBeat, rippleBeat],
    ...th,
  });
}
