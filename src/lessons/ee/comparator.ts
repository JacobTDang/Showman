/**
 * ee.comparator — the op-amp with the feedback taken away, and the price of it.
 *
 * Every stage in Tier 2 wired the output back to the inverting input, and the enormous
 * open-loop gain then worked FOR you: it dragged v− onto v+ and the resistors set the gain.
 * Take that wire away and the same gain works against you. Two hundred thousand times
 * anything bigger than 65 microvolts is past the rail, so the output has only two values,
 * and the circuit answers one question: is v_in above V_ref or below it?
 *
 * That is genuinely useful — it is how a signal becomes a logic level — and it has one
 * defect, which is the whole reason the next lesson exists. A real input is never clean.
 * Near the crossing the noise is steeper than the signal, so the input crosses the
 * threshold several times on its way through, and the output faithfully reports every one
 * of them. One event, a burst of edges. A counter downstream counts them all.
 *
 * The noise here is three fixed sinusoids, not a random draw, so the drawing is the same
 * every time it is rendered — but it is doing the real thing: crossing back over the
 * threshold because its slope near the crossing beats the signal's.
 */
import type { Node, SceneSpec, Track } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, xyCurvePane, type Beat } from "./kit.js";
import { comparatorStage } from "./comparatorSchematics.js";
import { OPEN_LOOP } from "./opAmpRules.js";
import { fade, withTracks } from "./util.js";

/**
 * The signal, the reference and the device, shared with the two lessons that follow so the
 * Schmitt trigger is measurably better on the SAME input rather than on a kinder one.
 */
export const COMPARATOR = {
  /** Rail voltage, volts. The same device model Tier 2 uses. */
  vSat: OPEN_LOOP.vSat,
  /** Open-loop DC gain, volts per volt. */
  A: OPEN_LOOP.A,
  /** The threshold the comparator is asked about, volts. */
  vRef: 5,
  /** Amplitude of the clean part of the input, volts. */
  amp: 6.5,
  /** Seconds on the scope's time axis: exactly one cycle of the signal. */
  tMax: 6,
  /** Samples across that window. A square edge and a chatter burst both need a lot of them. */
  samples: 2400,
  /**
   * The "noise": three fixed sinusoids, 2.2%, 3.4% and 6.2% of the signal's amplitude and
   * 22, 50 and 79 cycles across the window. Deterministic, so the render is byte-stable.
   *
   * The fastest one carries the most amplitude on purpose. Give the SLOW component the
   * largest amplitude instead and it merely walks the input across the threshold once, with
   * the fast component too small to bring it back: the drawing then shows a clean edge and
   * the lesson has no subject. Chatter needs a component that is both fast and big enough
   * to re-cross, which is exactly the noise a comparator is bad at.
   */
  noise: [
    { a: 0.14, f: 3.7, phase: 0.7 },
    { a: 0.22, f: 8.3, phase: 2.4 },
    { a: 0.4, f: 13.1, phase: 5.1 },
  ],
  /** Where the clean signal crosses V_ref: the two events the output should report. */
  crossings: [] as number[],
};

/** The largest the noise can ever be, volts. Sets how wide a crossing is smeared. */
export const NOISE_BOUND = COMPARATOR.noise.reduce((s, n) => s + n.a, 0);

COMPARATOR.crossings = (() => {
  const theta = Math.asin(COMPARATOR.vRef / COMPARATOR.amp);
  const scale = COMPARATOR.tMax / (2 * Math.PI);
  return [theta * scale, (Math.PI - theta) * scale];
})();

/** The signal without the noise: one slow cycle, peak `amp`. */
export function cleanInput(t: number): number {
  return COMPARATOR.amp * Math.sin((2 * Math.PI * t) / COMPARATOR.tMax);
}

/** What the comparator actually sees. */
export function noisyInput(t: number): number {
  let v = cleanInput(t);
  for (const n of COMPARATOR.noise) v += n.a * Math.sin(2 * Math.PI * n.f * t + n.phase);
  return v;
}

/** The open-loop comparator: above the reference is one rail, below it is the other. */
export function comparatorOut(t: number): number {
  return noisyInput(t) > COMPARATOR.vRef ? COMPARATOR.vSat : -COMPARATOR.vSat;
}

/**
 * How many edges the DRAWN output carries. The trace is `samples + 1` points sampled
 * uniformly across the window, so counting sign changes here counts exactly what a reader
 * sees on the screen — not what an infinitely fine simulation would have produced.
 */
export function drawnEdges(out: (t: number) => number, tMax: number, samples: number): number {
  let edges = 0;
  let prev = Math.sign(out(0));
  for (let i = 1; i <= samples; i++) {
    const s = Math.sign(out((i / samples) * tMax));
    if (s !== prev) edges++;
    prev = s;
  }
  return edges;
}

/**
 * Fade in to a translucent value, not to 1.
 *
 * `fade` from `util.ts` animates opacity to fully opaque, which is right for a label and
 * wrong for a highlight: a band faded that way covers the trace it is supposed to point at.
 * Every highlight in this tier arrives through here instead.
 */
export function fadeTo(at: number, to: number, dur = 0.5): Track[] {
  return [
    {
      property: "opacity",
      keyframes: [
        { t: at, value: 0 },
        { t: at + dur, value: to },
      ],
    },
  ];
}

/** The stretch around each crossing where the noise can still carry the input back over it. */
export function chatterWindows(): Array<{ from: number; to: number }> {
  const steps = 4000;
  const out: Array<{ from: number; to: number }> = [];
  let open: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * COMPARATOR.tMax;
    const near = Math.abs(cleanInput(t) - COMPARATOR.vRef) < NOISE_BOUND;
    if (near && open === null) open = t;
    if (!near && open !== null) {
      out.push({ from: open, to: t });
      open = null;
    }
  }
  if (open !== null) out.push({ from: open, to: COMPARATOR.tMax });
  return out;
}

export interface ComparatorOptions {
  /** The reference the input is compared against, volts. Default 5 V. */
  vRef?: number;
  theme?: string;
}

const T_CIRCUIT = 0.5;
const T_RULE = 5.5;
const T_RUN = 11;
const T_CHATTER = 20.5;
const T_COST = 27;
const T_NEXT = 32;
const RUN = 8;
/** Axis half-range for the input, volts: the peak plus its noise, with room to see it. */
const V_IN_AXIS = 8;
/** Axis half-range for the output, volts. */
const V_OUT_AXIS = 16;
/** Half-range of the transfer view's input axis, volts. */
const V_X_AXIS = 7.5;

export function buildComparator(o: ComparatorOptions = {}): SceneSpec {
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const vRef = o.vRef ?? COMPARATOR.vRef;
  const { vSat, tMax, samples } = COMPARATOR;
  const microvolts = Math.round((vSat / COMPARATOR.A) * 1e6);
  const out = (t: number) => (noisyInput(t) > vRef ? vSat : -vSat);
  const edges = drawnEdges(out, tMax, samples);
  const bands = chatterWindows();

  /* ---------------------------------------------------------------- schematic */
  const sch = comparatorStage({
    id: "cp-sch",
    x: LAYOUT.schematic.x + 120,
    y: LAYOUT.schematic.y + 55,
    current: true,
    refLabel: `V_ref = ${vRef.toFixed(1)} V`,
    ...th,
  });
  const noFeedback: Node = {
    id: "cp-nofb",
    type: "text",
    x: LAYOUT.schematic.x + LAYOUT.schematic.w / 2,
    y: LAYOUT.schematic.y + LAYOUT.schematic.h - 20,
    text: "no feedback at all: nothing comes back from the output",
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 16,
    fill: theme.palette.secondary,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.schematic.w,
    tracks: fade(T_CIRCUIT + 1.5),
  };

  /* -------------------------------------------------------------------- scope */
  const scope = scopePaneRaw({
    id: "cp-scope",
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
        yTicks: [-5, 0, 5],
        yTickLabel: (v) => `${v} V`,
        traces: [
          { id: "ref", fn: () => vRef, color: theme.palette.secondary, dash: [7, 5], strokeWidth: 2 },
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
  /** Plane pixels are the only honest way to place a band: ask the plane where the time is. */
  const inPlane = scope.planes[0]!;
  const outPlane = scope.planes[1]!;
  const planeH = inPlane.toLocal(0, -V_IN_AXIS).y;
  const scopeX = LAYOUT.scope.x + 76;
  const scopeY = LAYOUT.scope.y + 8;
  const atTime = (t: number) => scopeX + inPlane.originX + inPlane.toLocal(t, 0).x;
  const bandNodes: Node[] = bands.map((b, i) => ({
    id: `cp-band-${i}`,
    type: "rect",
    x: atTime(b.from),
    y: scopeY + inPlane.originY,
    width: atTime(b.to) - atTime(b.from),
    height: outPlane.originY - inPlane.originY + planeH,
    fill: theme.palette.secondary,
    tracks: fadeTo(T_CHATTER, 0.16),
  }));
  const bandLabel: Node = {
    id: "cp-band-lbl",
    type: "text",
    x: LAYOUT.scope.x + LAYOUT.scope.w / 2 + 60,
    y: LAYOUT.scope.y - 20,
    text: "one crossing, a burst of edges",
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 16,
    fill: theme.palette.secondary,
    align: "center",
    baseline: "middle",
    tracks: fade(T_CHATTER + 0.3),
  };

  /* ------------------------------------------------------------ transfer view */
  /** The step, drawn as the path it is: rail, jump at V_ref, rail. */
  const step = (u: number) => {
    const s = u / tMax;
    if (s < 0.45) return { x: -V_X_AXIS + ((vRef + V_X_AXIS) * s) / 0.45, y: -vSat };
    if (s < 0.55) return { x: vRef, y: -vSat + (2 * vSat * (s - 0.45)) / 0.1 };
    return { x: vRef + ((V_X_AXIS - vRef) * (s - 0.55)) / 0.45, y: vSat };
  };
  const vtc = xyCurvePane({
    id: "cp-vtc",
    x: LAYOUT.transfer.x + 82,
    y: LAYOUT.transfer.y + 14,
    width: LAYOUT.transfer.w - 122,
    height: LAYOUT.transfer.h - 66,
    xMin: -V_X_AXIS,
    xMax: V_X_AXIS,
    yMin: -V_OUT_AXIS,
    yMax: V_OUT_AXIS,
    xTicks: [-5, 0, vRef],
    yTicks: [-vSat, 0, vSat],
    xTickLabel: (v) => `${v} V`,
    yTickLabel: (v) => `${v} V`,
    xLabel: "v_in",
    yLabel: "v_out",
    legendAt: "bottom",
    uMax: tMax,
    samples: 800,
    traces: [{ id: "step", at: step, color: theme.palette.accent, strokeWidth: 3, start: T_RUN, duration: 2 }],
    dots: [{ id: "dot", at: (u) => ({ x: noisyInput(u), y: out(u) }), color: theme.palette.primary, start: T_RUN, duration: RUN }],
    ...th,
  });
  /** A caption inside the box, at a voltage nothing is ever drawn at. */
  const vtcLegend: Node = {
    id: "cp-vtc-legend",
    type: "text",
    x: LAYOUT.transfer.x + 82 + vtc.plane.toLocal(-1, 5).x,
    y: LAYOUT.transfer.y + 14 + vtc.plane.toLocal(-1, 5).y,
    text: "one step, at V_ref",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 14,
    fill: theme.palette.accent,
    align: "center",
    baseline: "middle",
    tracks: fade(T_RUN + 1),
  };
  const vtcNote: Node = {
    id: "cp-vtc-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 14,
    text: `The step is ${microvolts} µV wide — vertical at any scale you can read.`,
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 16,
    fill: theme.palette.text,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w + 40,
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
    dur: 4.5,
    say: "Same op amp, one wire missing. Nothing comes back from the output, so the gain of two hundred thousand has nothing to settle against.",
    nodes: [withTracks(sch.node, fade(T_CIRCUIT)), noFeedback],
  };

  const rule: Beat = {
    at: T_RULE,
    dur: 5.5,
    say: `Sixty five microvolts of difference is already past the rail. So the output has two values, and the circuit answers one question: is v in above the reference, or below it?`,
    nodes: [
      equationPane({ id: "cp-eq-rule", latex: "v_{out}=A\\,(v_{in}-V_{ref})", x: eqX, y: eqY + 6, at: T_RULE, size: 26, ...th }).node,
      equationPane({
        id: "cp-eq-rail",
        latex: `|v_{in}-V_{ref}|>${microvolts}\\,\\mu\\mathrm{V}\\;\\Rightarrow\\;v_{out}=\\pm ${vSat}\\,\\mathrm{V}`,
        x: eqX,
        y: eqY + 72,
        at: T_RULE + 1.6,
        size: 24,
        color: theme.palette.accent,
        ...th,
      }).node,
      counter("cp-ctr-vref", eqY + 152, vRef, "V_ref = ", " V", 1, theme.palette.secondary, T_RULE + 2.6),
    ],
  };

  const run: Beat = {
    at: T_RUN,
    dur: RUN + 1,
    say: "A slow signal, slightly noisy, rising through the reference and back down again. The output snaps to a rail and the dot flicks across the step.",
    nodes: [withTracks(scope.node, fade(T_RUN - 0.5)), withTracks(vtc.node, fade(T_RUN - 0.5)), vtcLegend, vtcNote],
  };

  const chatter: Beat = {
    at: T_CHATTER,
    dur: 6,
    say: "Look at the two crossings. The noise is steeper there than the signal is, so the input goes back over the threshold again and again, and the output reports every single one.",
    nodes: [
      ...bandNodes,
      bandLabel,
      counter("cp-ctr-edges", eqY + 198, edges, "output edges: ", "", 0, theme.palette.accent, T_CHATTER + 1),
    ],
  };

  const cost: Beat = {
    at: T_COST,
    dur: 5,
    say: `Two crossings should give two edges. This drawing has ${edges}. Feed that into a counter and it counts ${edges}; feed it into a motor driver and the driver stutters.`,
    nodes: [
      {
        id: "cp-cost",
        type: "text",
        x: eqX,
        y: eqY + 242,
        text: `Two crossings should give 2 edges, not ${edges}.`,
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 19,
        fill: theme.palette.secondary,
        align: "left",
        baseline: "middle",
        maxWidth: LAYOUT.equation.w,
        tracks: fade(T_COST),
      },
    ],
  };

  const next: Beat = {
    at: T_NEXT,
    dur: 4,
    say: "The fix is not a cleaner signal. It is a threshold that moves once it has been crossed.",
    nodes: [
      {
        id: "cp-next",
        type: "text",
        x: eqX,
        y: eqY + 284,
        text: "The fix is a threshold that moves.",
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 19,
        fill: theme.palette.primary,
        align: "left",
        baseline: "middle",
        maxWidth: LAYOUT.equation.w,
        tracks: fade(T_NEXT),
      },
    ],
  };

  return eeLesson({
    title: "The comparator: no feedback, two answers, and a burst of them",
    beats: [circuit, rule, run, chatter, cost, next],
    ...th,
  });
}
