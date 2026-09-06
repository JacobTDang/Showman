/**
 * ee.integrator — a square wave in, a triangle out, and why.
 *
 * The mechanism is three facts, each of which the student already has. The inverting node
 * is a virtual ground, so the input current is v_in/R and is CONSTANT while a square wave
 * holds still. None of it enters the op amp, so all of it flows into the capacitor. And a
 * constant current into a capacitor is a constant dv/dt — a straight ramp, not a curve.
 * Slope = −v_in/(RC). With R = 10 kΩ and C = 100 nF that is exactly one volt per
 * millisecond, and the counter reads it flipping sign every time the input flips.
 *
 * Then the two elements swap and the same three facts run backwards: the capacitor is now
 * the input, so the current is C·dv_in/dt, and the resistor turns that current into a
 * voltage. Triangle in, square out, v_out = −RC·dv_in/dt.
 *
 * The transfer view carries the part a static schematic can never show. Neither circuit
 * has a transfer characteristic at all: plot v_out against v_in and the operating point
 * traces a LOOP rather than a curve, because the output depends on what the input has been
 * doing, not on what it is. The integrator's loop runs down one side and up the other; the
 * differentiator's runs along the top and back along the bottom. A memoryless stage — the
 * amplifiers before this one — collapses that loop to a single line.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, xyCurvePane, type Beat } from "./kit.js";
import { integratorStage } from "./opAmpSchematics.js";
import { fade, fadeBetween, fmtC, fmtR, fmtTau, stepTrack, withTracks } from "./util.js";

export interface IntegratorOptions {
  /** Input resistor, ohms. Default 10 kΩ. */
  R?: number;
  /** Feedback capacitor, farads. Default 100 nF. */
  C?: number;
  /** Square-wave amplitude, volts. Default 1 V. */
  V?: number;
  theme?: string;
}

const T_CIRCUIT = 0.5;
const T_MECH = 5;
const T_INT = 10.5;
const T_SLOPE = 18;
const T_SWAP = 22.5;
const T_DIFF = 27;
const T_NOTE = 34.5;
const RUN = 7;
/** Milliseconds shown on the scope's time axis: two full periods of the drive. */
const SCOPE_MS = 4;
/** Periods of the drive across that window. */
const PERIODS = 2;

export function buildIntegrator(o: IntegratorOptions = {}): SceneSpec {
  const R = o.R ?? 10e3;
  const C = o.C ?? 100e-9;
  const V = o.V ?? 1;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  /** The time constant in milliseconds, which is the unit the scope's axis is in. */
  const tauMs = R * C * 1000;
  const halfMs = SCOPE_MS / (2 * PERIODS);
  /** Ramp slope, volts per millisecond: −v_in/(RC). */
  const slope = V / tauMs;
  /** Half the peak-to-peak of the triangle: the ramp run over one half period. */
  const tri = (slope * halfMs) / 2;

  /** Which half period t falls in. */
  const halfIndex = (t: number) => Math.floor(t / halfMs);
  /** The square wave in: +V for the first half period, then −V. */
  const square = (t: number) => (halfIndex(t) % 2 === 0 ? V : -V);
  /** The integrator's output slope, V/ms. This is the lesson: dv_out/dt = −v_in/(RC). */
  const rampSlope = (t: number) => -square(t) / tauMs;
  /** Its integral, started at +tri so the triangle is centred. Straight segments, not curves. */
  const ramp = (t: number) => {
    const k = halfIndex(t);
    const into = t - k * halfMs;
    return (k % 2 === 0 ? tri : -tri) + rampSlope(t) * into;
  };
  /**
   * The differentiator half, fed that triangle: v_out = −RC·dv_in/dt, with RC in
   * milliseconds to match the axis. Two inversions cancel, so what comes back out is the
   * original square wave — which is exactly what "the differentiator undoes it" means.
   */
  const squareOut = (t: number) => -tauMs * rampSlope(t);

  const vAxis = Math.max(V, tri) * 1.35;

  /* ---------------------------------------------------------------- schematic */
  const intSch = integratorStage({
    id: "ig-sch-int",
    x: LAYOUT.schematic.x + 55,
    y: LAYOUT.schematic.y + 50,
    current: true,
    input: "resistor",
    feedback: "capacitor",
    inputLabel: `R = ${fmtR(R)}`,
    feedbackLabel: `C = ${fmtC(C)}`,
    ...th,
  });
  const diffSch = integratorStage({
    id: "ig-sch-diff",
    x: LAYOUT.schematic.x + 55,
    y: LAYOUT.schematic.y + 50,
    current: true,
    input: "capacitor",
    feedback: "resistor",
    inputLabel: `C = ${fmtC(C)}`,
    feedbackLabel: `R = ${fmtR(R)}`,
    ...th,
  });
  /** The current into the node: the same in both halves, and the whole mechanism. */
  const currentNote = (id: string, text: string, tracks: Node["tracks"]): Node => ({
    id,
    type: "text",
    x: intSch.points.summing.x - 10,
    y: intSch.points.summing.y + 26,
    text,
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 15,
    fill: theme.palette.secondary,
    align: "right",
    baseline: "middle",
    tracks,
  });

  const circuit: Beat = {
    at: T_CIRCUIT,
    dur: 4,
    say: `A resistor in, a capacitor in the feedback path. The plus terminal is grounded, so the minus terminal is a virtual ground: it sits at zero volts no matter what the output does.`,
    nodes: [
      withTracks(intSch.node, fadeBetween(T_CIRCUIT, T_SWAP)),
      withTracks(diffSch.node, fade(T_SWAP + 0.4)),
      currentNote("ig-vg", "0 V", fadeBetween(T_CIRCUIT + 1, T_SWAP)),
    ],
  };

  /* ---------------------------------------------------------------- mechanism */
  const eqX = LAYOUT.equation.x;
  /** The column is reused by the differentiator, so the integrator's algebra must clear out. */
  const untilSwap = (node: Node, at: number): Node => ({ ...node, tracks: fadeBetween(at, T_SWAP) });
  const mech: Beat = {
    at: T_MECH,
    dur: 5.5,
    say: "So the input current is v in over R, and while the input holds still that current is constant. All of it goes into the capacitor, and a constant current into a capacitor means a constant rate of change of voltage. A straight ramp.",
    nodes: [
      untilSwap(
        equationPane({
          id: "ig-eq-i",
          latex: "i=\\frac{v_{in}}{R}=-C\\frac{dv_{out}}{dt}",
          x: eqX,
          y: LAYOUT.equation.y + 6,
          at: T_MECH,
          size: 25,
          ...th,
        }).node,
        T_MECH,
      ),
      untilSwap(
        equationPane({
          id: "ig-eq-int",
          latex: "v_{out}=-\\frac{1}{RC}\\int v_{in}\\,dt",
          x: eqX,
          y: LAYOUT.equation.y + 86,
          at: T_MECH + 1.8,
          size: 28,
          color: theme.palette.accent,
          ...th,
        }).node,
        T_MECH + 1.8,
      ),
      {
        id: "ig-tau",
        type: "text",
        x: eqX,
        y: LAYOUT.equation.y + 178,
        text: `RC = ${fmtR(R)} × ${fmtC(C)} = ${fmtTau(R * C)}`,
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 18,
        fill: theme.palette.text,
        align: "left",
        baseline: "middle",
        tracks: fade(T_MECH + 2.5),
      },
      {
        id: "ig-ctr-slope",
        type: "counter",
        x: eqX,
        y: LAYOUT.equation.y + 228,
        value: -slope,
        decimals: 2,
        prefix: "dv_out/dt = ",
        suffix: " V/ms",
        fontFamily: LABEL_FONT,
        fontSize: 26,
        fill: theme.palette.accent,
        align: "left",
        baseline: "middle",
        tracks: [
          // The slope is -v_in/(RC): it holds while the square holds, and flips when it flips.
          stepTrack(
            Array.from({ length: 2 * PERIODS }, (_, k) => ({
              at: Number((T_INT + (k * halfMs * RUN) / SCOPE_MS).toFixed(3)),
              value: k % 2 === 0 ? -slope : slope,
            })),
          ),
          ...fadeBetween(T_INT, T_SWAP),
        ],
      },
    ],
  };

  /* -------------------------------------------------------------------- scope */
  const scope = (id: string, inFn: (t: number) => number, outFn: (t: number) => number, start: number) =>
    scopePaneRaw({
      id,
      x: LAYOUT.scope.x + 76,
      y: LAYOUT.scope.y + 8,
      width: LAYOUT.scope.w - 106,
      height: LAYOUT.scope.h - 26,
      tMax: SCOPE_MS,
      // A square wave's edges are vertical; too few samples and they lean.
      samples: 2000,
      xLabel: "time (ms)",
      planes: [
        {
          label: "v_in",
          yMin: -vAxis,
          yMax: vAxis,
          yTicks: [-V, 0, V],
          yTickLabel: (v) => `${v} V`,
          traces: [{ id: "in", fn: inFn, color: theme.palette.primary, start, duration: RUN, strokeWidth: 2.5 }],
        },
        {
          label: "v_out",
          yMin: -vAxis,
          yMax: vAxis,
          // The half-volt marks are what make the ramp's one volt of swing readable off the screen.
          yTicks: [-V, -tri, 0, tri, V],
          yTickLabel: (v) => `${v} V`,
          traces: [{ id: "out", fn: outFn, color: theme.palette.accent, start, duration: RUN, marker: true, strokeWidth: 2.5 }],
        },
      ],
      ...th,
    });
  const intScope = scope("ig-scope-int", square, ramp, T_INT);
  const diffScope = scope("ig-scope-diff", ramp, squareOut, T_DIFF);

  /* ------------------------------------------------------------ transfer view */
  const loop = (id: string, inFn: (t: number) => number, outFn: (t: number) => number, start: number, color: string, label: string) =>
    xyCurvePane({
      id,
      x: LAYOUT.transfer.x + 82,
      y: LAYOUT.transfer.y + 14,
      width: LAYOUT.transfer.w - 122,
      height: LAYOUT.transfer.h - 66,
      xMin: -vAxis,
      xMax: vAxis,
      yMin: -vAxis,
      yMax: vAxis,
      xTicks: [-V, 0, V],
      yTicks: [-V, 0, V],
      xTickLabel: (v) => `${v} V`,
      yTickLabel: (v) => `${v} V`,
      xLabel: "v_in",
      yLabel: "v_out",
      legendAt: "bottom",
      // One full period is the whole loop; a second lap would only retrace it.
      uMax: 2 * halfMs,
      samples: 900,
      traces: [{ id: "loop", at: (u) => ({ x: inFn(u), y: outFn(u) }), color, strokeWidth: 3, start, duration: 2, label }],
      dots: [{ id: "dot", at: (u) => ({ x: inFn(u), y: outFn(u) }), color, start, duration: RUN }],
      ...th,
    });
  const intVtc = loop("ig-vtc-int", square, ramp, T_INT, theme.palette.accent, "one period, traced");
  const diffVtc = loop("ig-vtc-diff", ramp, squareOut, T_DIFF, theme.palette.secondary, "one period, traced");

  const intRun: Beat = {
    at: T_INT,
    dur: RUN + 0.5,
    say: `A one volt square wave in. While it holds at plus one, the output slides straight down; when it flips, the output slides straight back up. Square in, triangle out — and every segment is a line, not a curve.`,
    nodes: [withTracks(intScope.node, fadeBetween(T_INT - 0.5, T_SWAP)), withTracks(intVtc.node, fadeBetween(T_INT - 0.5, T_SWAP))],
  };

  const slopeNote: Node = {
    id: "ig-slope-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 14,
    // The theme's pinned fonts have ±, but not ∓, so the two signs are named instead.
    text: `Slope = −v_in/(RC): −${slope.toFixed(0)} V/ms while v_in is +${V} V, +${slope.toFixed(0)} while it is −${V} V.`,
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 17,
    fill: theme.palette.text,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w + 40,
    tracks: fadeBetween(T_SLOPE, T_SWAP),
  };
  const slopeBeat: Beat = {
    at: T_SLOPE,
    dur: 4.5,
    say: `Read the slope: minus v in over R C. One volt over one millisecond is one volt per millisecond, and the counter flips sign the instant the square wave does. Half a period later the output has moved exactly one volt.`,
    nodes: [slopeNote],
  };

  /* ------------------------------------------------------------ differentiator */
  const swapNote: Node = {
    id: "ig-swap",
    type: "text",
    x: LAYOUT.schematic.x + LAYOUT.schematic.w / 2,
    y: LAYOUT.schematic.y + LAYOUT.schematic.h - 4,
    text: "swap them: C in, R in the feedback path",
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 18,
    fill: theme.palette.secondary,
    align: "center",
    baseline: "middle",
    tracks: fade(T_SWAP),
  };
  const swapBeat: Beat = {
    at: T_SWAP,
    dur: 4.5,
    say: "Now swap the two parts. The capacitor is the input element, so the current it passes is C times the rate of change of the input, and the resistor turns that current back into a voltage.",
    nodes: [
      swapNote,
      equationPane({
        id: "ig-eq-idiff",
        latex: "i=C\\frac{dv_{in}}{dt}=-\\frac{v_{out}}{R}",
        x: eqX,
        y: LAYOUT.equation.y + 6,
        at: T_SWAP + 0.5,
        size: 25,
        ...th,
      }).node,
      equationPane({
        id: "ig-eq-diff",
        latex: "v_{out}=-RC\\frac{dv_{in}}{dt}",
        x: eqX,
        y: LAYOUT.equation.y + 86,
        at: T_SWAP + 1.5,
        size: 28,
        color: theme.palette.secondary,
        ...th,
      }).node,
    ],
  };
  const diffRun: Beat = {
    at: T_DIFF,
    dur: RUN + 0.5,
    say: "Feed it the triangle we just made. The triangle has only two slopes, up and down, so the output has only two values — and it is a square wave again. The differentiator undoes the integrator.",
    nodes: [withTracks(diffScope.node, fade(T_DIFF - 0.5)), withTracks(diffVtc.node, fade(T_DIFF - 0.5))],
  };

  const note: Node = {
    id: "ig-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 14,
    text: "A loop, not a line: neither circuit has a transfer characteristic.",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 16,
    fill: theme.palette.accent,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w + 60,
    tracks: fade(T_NOTE),
  };
  const noteBeat: Beat = {
    at: T_NOTE,
    dur: 4,
    say: "In both halves the dot goes round a loop, not along a line. Neither circuit has a transfer characteristic at all.",
    nodes: [note],
  };

  return eeLesson({
    title: "The integrator: constant current into a capacitor is a ramp",
    beats: [circuit, mech, intRun, slopeBeat, swapBeat, diffRun, noteBeat],
    ...th,
  });
}
