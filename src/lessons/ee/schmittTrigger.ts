/**
 * ee.schmittTrigger — one threshold is the problem; two thresholds are the fix.
 *
 * The comparator chattered because its threshold stood still while a noisy input walked
 * back and forth across it. Move the threshold instead: after the output goes high, raise
 * the bar the input would have to fall back under, so the noise cannot reach it.
 *
 * A wire from the output to the + terminal does exactly that, and only that. Feedback to +
 * is POSITIVE feedback — it pushes the output further in the direction it is already going
 * — so the output is always hard against a rail, and the divider R_1, R_2 holds the +
 * terminal at β·v_out with β = R_1/(R_1 + R_2). There are therefore two thresholds, one per
 * rail: V_TH = +β·V_sat while the output is high, V_TL = −β·V_sat while it is low. The gap
 * between them is the hysteresis, and it is the noise the circuit can ignore.
 *
 * The configuration drawn here is the INVERTING Schmitt trigger: the signal on the −
 * terminal, because + is occupied by the feedback. That is the cost, and it is worth naming
 * out loud — the output is upside down compared with the comparator lesson. The
 * non-inverting Schmitt exists, drives the signal into the + node through R_1, and has
 * thresholds ±(R_1/R_2)·V_sat instead; the inverting one is drawn here because its β is the
 * same β the relaxation oscillator's period formula is written in.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, xyCurvePane, type Beat } from "./kit.js";
import { schmittStage } from "./comparatorSchematics.js";
import { COMPARATOR, cleanInput, drawnEdges, fadeTo, noisyInput } from "./comparator.js";
import { fade, fmtR, withTracks } from "./util.js";

const R1 = 10e3;
const R2 = 16e3;
const BETA = R1 / (R1 + R2);

/** The divider, the thresholds it sets, and the axes the two loop lessons share. */
export const SCHMITT = {
  R1,
  R2,
  /** The fraction of the output the divider returns to the + terminal. 10/26 exactly. */
  beta: BETA,
  /** Upper threshold, volts: what the input must exceed while the output is high. */
  vTh: COMPARATOR.vSat * BETA,
  /** Lower threshold, volts. */
  vTl: -COMPARATOR.vSat * BETA,
  /** Half-range of the transfer view's input axis, volts. */
  vAxis: 7.5,
  /** Where the clean signal crosses whichever threshold is active. */
  crossings: [] as number[],
};

/** Grid the stateful output is solved on. Finer than any trace drawn from it. */
const STEPS = 6000;

/**
 * The inverting Schmitt trigger's output, solved forward in time.
 *
 * It cannot be a function of the present input alone — that is the entire point of
 * hysteresis — so it is integrated once on a fine grid and the drawn trace reads back off
 * it. Which threshold is live depends on which rail the output is on, and the output only
 * ever leaves a rail when the input passes the live threshold.
 */
export function schmittStates(vin: (t: number) => number, tMax: number, vTh: number, vTl: number, steps = STEPS): Int8Array {
  const s = new Int8Array(steps + 1);
  // Inverting: the output starts high unless the input is already above the upper threshold.
  let state: number = vin(0) > vTh ? -1 : 1;
  for (let i = 0; i <= steps; i++) {
    const v = vin((i / steps) * tMax);
    if (state === 1 && v > vTh) state = -1;
    else if (state === -1 && v < vTl) state = 1;
    s[i] = state;
  }
  return s;
}

/** Read a solved state array back as a function of time, for a trace or a dot. */
export function stateReader(states: Int8Array, tMax: number, vSat: number): (t: number) => number {
  const last = states.length - 1;
  return (t) => states[Math.max(0, Math.min(last, Math.round((t / tMax) * last)))]! * vSat;
}

SCHMITT.crossings = (() => {
  const out: number[] = [];
  const { vTh, vTl } = SCHMITT;
  let state: number = cleanInput(0) > vTh ? -1 : 1;
  for (let i = 1; i <= STEPS; i++) {
    const t = (i / STEPS) * COMPARATOR.tMax;
    const v = cleanInput(t);
    if (state === 1 && v > vTh) {
      state = -1;
      out.push(t);
    } else if (state === -1 && v < vTl) {
      state = 1;
      out.push(t);
    }
  }
  return out;
})();

export interface SchmittTriggerOptions {
  /** Resistor from the divider tap to the common rail, ohms. Default 10 kΩ. */
  R1?: number;
  /** Resistor from the output back to the divider tap, ohms. Default 16 kΩ. */
  R2?: number;
  theme?: string;
}

const T_CIRCUIT = 0.5;
const T_THRESH = 5.5;
const T_RUN = 11.5;
const T_LOOP = 21;
const T_COMPARE = 27;
const T_MARGIN = 32.5;
const RUN = 8.5;
const V_IN_AXIS = 8;
const V_OUT_AXIS = 16;

export function buildSchmittTrigger(o: SchmittTriggerOptions = {}): SceneSpec {
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const r1 = o.R1 ?? SCHMITT.R1;
  const r2 = o.R2 ?? SCHMITT.R2;
  const beta = r1 / (r1 + r2);
  const { vSat, tMax, samples } = COMPARATOR;
  const vTh = vSat * beta;
  const vTl = -vTh;
  const states = schmittStates(noisyInput, tMax, vTh, vTl);
  const out = stateReader(states, tMax, vSat);
  const edges = drawnEdges(out, tMax, samples);
  const comparatorEdges = drawnEdges((t) => (noisyInput(t) > COMPARATOR.vRef ? vSat : -vSat), tMax, samples);

  /* ---------------------------------------------------------------- schematic */
  const sch = schmittStage({
    id: "st-sch",
    x: LAYOUT.schematic.x + 90,
    y: LAYOUT.schematic.y + 14,
    current: true,
    r1Label: `R_1 = ${fmtR(r1)}`,
    r2Label: `R_2 = ${fmtR(r2)}`,
    ...th,
  });
  const feedbackNote: Node = {
    id: "st-fb-note",
    type: "text",
    // Left of the divider column: to its right sit R_2's label and R_1's, one under the other.
    x: sch.points.threshold.x - 14,
    y: sch.points.threshold.y + 26,
    text: "v+ = β · v_out",
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 16,
    fill: theme.palette.accent,
    align: "right",
    baseline: "middle",
    tracks: fade(T_CIRCUIT + 1.5),
  };
  const invertNote: Node = {
    id: "st-invert-note",
    type: "text",
    x: LAYOUT.schematic.x + LAYOUT.schematic.w / 2,
    y: LAYOUT.schematic.y + LAYOUT.schematic.h + 6,
    text: "The + terminal is taken, so the signal moves to −: this one inverts.",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 16,
    fill: theme.palette.secondary,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.schematic.w,
    tracks: fade(T_CIRCUIT + 2.5),
  };

  /* -------------------------------------------------------------------- scope */
  const scope = scopePaneRaw({
    id: "st-scope",
    x: LAYOUT.scope.x + 76,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 106,
    height: LAYOUT.scope.h - 26,
    tMax,
    samples,
    xLabel: "time",
    planes: [
      {
        label: "v_in",
        yMin: -V_IN_AXIS,
        yMax: V_IN_AXIS,
        yTicks: [vTl, 0, vTh],
        yTickLabel: (v) => `${v} V`,
        traces: [
          { id: "th", fn: () => vTh, color: theme.palette.secondary, dash: [7, 5], strokeWidth: 2 },
          { id: "tl", fn: () => vTl, color: theme.palette.secondary, dash: [7, 5], strokeWidth: 2 },
          { id: "in", fn: noisyInput, color: theme.palette.primary, start: T_RUN, duration: RUN, strokeWidth: 2 },
        ],
      },
      {
        label: "v_out",
        yMin: -V_OUT_AXIS,
        yMax: V_OUT_AXIS,
        yTicks: [-vSat, 0, vSat],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "out", fn: out, color: theme.palette.accent, start: T_RUN, duration: RUN, strokeWidth: 2.5 }],
      },
    ],
    ...th,
  });
  const inPlane = scope.planes[0]!;
  const bandY = LAYOUT.scope.y + 8 + inPlane.originY;
  const bandTop = inPlane.toLocal(0, vTh).y;
  const bandBottom = inPlane.toLocal(0, vTl).y;
  /** The hysteresis, drawn on the scope as the strip of input the circuit simply ignores. */
  const band: Node = {
    id: "st-band",
    type: "rect",
    x: LAYOUT.scope.x + 76 + inPlane.originX,
    y: bandY + bandTop,
    width: LAYOUT.scope.w - 106,
    height: bandBottom - bandTop,
    fill: theme.palette.secondary,
    tracks: fadeTo(T_THRESH + 2, 0.15),
  };

  /* ------------------------------------------------------------ transfer view */
  /** The loop, drawn as the trip round it: across the top, down at V_TH, back, up at V_TL. */
  const V = SCHMITT.vAxis;
  const loop = (u: number) => {
    const s = u / tMax;
    if (s < 0.3) return { x: -V + ((vTh + V) * s) / 0.3, y: vSat };
    if (s < 0.4) return { x: vTh, y: vSat - (2 * vSat * (s - 0.3)) / 0.1 };
    if (s < 0.55) return { x: vTh + ((V - vTh) * (s - 0.4)) / 0.15, y: -vSat };
    if (s < 0.75) return { x: V - ((V - vTl) * (s - 0.55)) / 0.2, y: -vSat };
    if (s < 0.85) return { x: vTl, y: -vSat + (2 * vSat * (s - 0.75)) / 0.1 };
    return { x: vTl - ((vTl + V) * (s - 0.85)) / 0.15, y: vSat };
  };
  const vtc = xyCurvePane({
    id: "st-vtc",
    x: LAYOUT.transfer.x + 82,
    y: LAYOUT.transfer.y + 14,
    width: LAYOUT.transfer.w - 122,
    height: LAYOUT.transfer.h - 66,
    xMin: -V,
    xMax: V,
    yMin: -V_OUT_AXIS,
    yMax: V_OUT_AXIS,
    xTicks: [vTl, 0, vTh],
    yTicks: [-vSat, 0, vSat],
    xTickLabel: (v) => `${v} V`,
    yTickLabel: (v) => `${v} V`,
    xLabel: "v_in",
    yLabel: "v_out",
    legendAt: "bottom",
    uMax: tMax,
    samples: 800,
    traces: [{ id: "loop", at: loop, color: theme.palette.accent, strokeWidth: 3, start: T_RUN, duration: 6 }],
    dots: [{ id: "dot", at: (u) => ({ x: noisyInput(u), y: out(u) }), color: theme.palette.primary, start: T_RUN, duration: RUN }],
    ...th,
  });

  /** A caption inside the loop, where neither rail nor edge is ever drawn. */
  const vtcLegend: Node = {
    id: "st-vtc-legend",
    type: "text",
    x: LAYOUT.transfer.x + 82 + vtc.plane.toLocal(0, 4).x,
    y: LAYOUT.transfer.y + 14 + vtc.plane.toLocal(0, 4).y,
    text: "the way round is the memory",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 14,
    fill: theme.palette.accent,
    align: "center",
    baseline: "middle",
    tracks: fade(T_RUN + 3),
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
    say: "One wire back to the plus terminal. That is positive feedback: it pushes the output harder the way it is already going, so the output lives on a rail and the divider holds the plus terminal at beta times it.",
    nodes: [withTracks(sch.node, fade(T_CIRCUIT)), feedbackNote, invertNote],
  };

  const thresholds: Beat = {
    at: T_THRESH,
    dur: 6,
    say: `Two rails, two thresholds. While the output is high the input must climb past ${vTh.toFixed(2)} volts; the moment it flips, the bar drops to minus ${vTh.toFixed(2)}. The strip between them is noise the circuit cannot see.`,
    nodes: [
      equationPane({
        id: "st-eq-beta",
        latex: `v_+=\\beta\\,v_{out},\\qquad \\beta=\\frac{R_1}{R_1+R_2}=\\frac{${r1 / 1000}}{${(r1 + r2) / 1000}}`,
        x: eqX,
        y: eqY + 2,
        at: T_THRESH,
        size: 24,
        ...th,
      }).node,
      equationPane({
        id: "st-eq-thresholds",
        latex: "V_{TH}=+\\beta V_{sat},\\qquad V_{TL}=-\\beta V_{sat}",
        x: eqX,
        y: eqY + 80,
        at: T_THRESH + 1.6,
        size: 25,
        color: theme.palette.accent,
        ...th,
      }).node,
      counter("st-ctr-vth", eqY + 156, vTh, "V_TH = ", " V", 2, theme.palette.accent, T_THRESH + 2.6),
      counter("st-ctr-vtl", eqY + 198, vTl, "V_TL = ", " V", 2, theme.palette.accent, T_THRESH + 3.1),
      // The empty scope and its two dashed thresholds arrive with the algebra that names
      // them; only the traces wait for the run, so the band has a box to be drawn on.
      withTracks(scope.node, fade(T_THRESH + 1)),
      band,
    ],
  };

  const run: Beat = {
    at: T_RUN,
    dur: RUN + 1,
    say: "The same noisy input as before, not a cleaner one. The output flips once on the way up and once on the way down, and stays put in between. Note that it is upside down: this circuit inverts.",
    nodes: [withTracks(vtc.node, fade(T_RUN - 0.5)), vtcLegend],
  };

  const loopBeat: Beat = {
    at: T_LOOP,
    dur: 6,
    say: "Plot the output against the input and it is a loop, not a curve. Across the top, down at the upper threshold, back along the bottom, up at the lower one. Two answers at the same input: the way round is the memory.",
    nodes: [
      {
        id: "st-loop-note",
        type: "text",
        x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
        y: LAYOUT.transfer.y + LAYOUT.transfer.h + 14,
        text: `Between ${vTl.toFixed(2)} V and ${vTh.toFixed(2)} V the output depends on where it came from.`,
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 16,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
        maxWidth: LAYOUT.transfer.w + 40,
        tracks: fade(T_LOOP + 1),
      },
    ],
  };

  const compare: Beat = {
    at: T_COMPARE,
    dur: 5.5,
    say: `The comparator drew ${comparatorEdges} edges on this input. This draws ${edges}: one per crossing, which is what the signal actually did.`,
    nodes: [
      counter(
        "st-ctr-edges",
        eqY + 242,
        edges,
        "output edges: ",
        ` (the comparator: ${comparatorEdges})`,
        0,
        theme.palette.secondary,
        T_COMPARE,
      ),
    ],
  };

  const margin: Beat = {
    at: T_MARGIN,
    dur: 4,
    say: `To flip it back early, the noise would have to be bigger than the whole ${(vTh - vTl).toFixed(1)} volt band. It is under a volt.`,
    nodes: [
      {
        id: "st-margin",
        type: "text",
        x: eqX,
        y: eqY + 284,
        text: `noise margin: ${(vTh - vTl).toFixed(1)} V of hysteresis against 0.8 V of noise`,
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 18,
        fill: theme.palette.primary,
        align: "left",
        baseline: "middle",
        maxWidth: LAYOUT.equation.w,
        tracks: fade(T_MARGIN),
      },
    ],
  };

  return eeLesson({
    title: "The Schmitt trigger: a threshold that gets out of the way",
    beats: [circuit, thresholds, run, loopBeat, compare, margin],
    ...th,
  });
}
