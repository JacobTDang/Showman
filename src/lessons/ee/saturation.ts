/**
 * ee.saturation — the first place the ideal op-amp stops being true.
 *
 * Tier 2 ends with a straight line: v_out = −(R_f/R_in) v_in, with no end to it. Read
 * literally, five volts into a gain of four gives twenty volts out, and fifty gives two
 * hundred. Nothing in the formula says otherwise, because nothing in the formula knows
 * where the output's energy comes from.
 *
 * It comes from the two supply pins, and that is the whole lesson. On ±15 V rails a 741's
 * output stage cannot reach either rail — it stops about two volts short, at ±13 V — so the
 * straight line is a straight line only while |G·v_in| stays under 13. Above that the
 * output simply stops, and the sinusoid grows flat tops.
 *
 * So the input is turned up over the beat, from one volt to five, and two counters are put
 * side by side: the input peak and the output peak. For the first half they move together,
 * a factor of four apart. Then the output counter stops. The instant they part company is
 * the thing to remember; everything else here is decoration on it.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, xyCurvePane, type Beat } from "./kit.js";
import { invertingStage } from "./opAmpSchematics.js";
import { supplyRails } from "./realOpAmpSchematics.js";
import { fade, fmtR, valueTrack, withTracks } from "./util.js";

/** The device and the stage around it: a 741-class part on ±15 V, in a gain of −4. */
export const SATURATION = {
  Rin: 10e3,
  Rf: 40e3,
  /** Supply, volts. The rails themselves. */
  vSupply: 15,
  /** How close to a rail the output actually gets. A 741 stops about 2 V short. */
  vSat: 13,
  /** Input peak at the start of the run, volts. */
  vFrom: 1,
  /** Input peak at the end of the run, volts. */
  vTo: 5,
  /** Half-range of every output axis, volts: enough to hold the unclipped line. */
  vOutAxis: 22,
  /** Half-range of the input axis, volts. */
  vInAxis: 5.5,
} as const;

/** Seconds on the scope's time axis, and the input's drawn frequency across them. */
const SCOPE_T = 6;
const F_DRIVE = 1;

/** Lesson clock, seconds. */
const T_CIRCUIT = 0.5;
const T_IDEAL = 8;
const T_RUN = 14;
const RUN = 11.5;
const T_CLIP = 20.5;
const T_SAT = 26;
const T_NOTE = 32;

export interface SaturationOptions {
  /** Input resistor, ohms. Default 10 kΩ. */
  Rin?: number;
  /** Feedback resistor, ohms. Default 40 kΩ. */
  Rf?: number;
  /** Output swing limit, volts. Default 13 V, on ±15 V rails. */
  vSat?: number;
  theme?: string;
}

export interface SaturationModel {
  gain: number;
  vSat: number;
  scopeT: number;
  /** The input's peak at scope time t: a straight climb from vFrom to vTo. */
  envelope(t: number): number;
  vin(t: number): number;
  /** What the ideal formula promises. */
  ideal(t: number): number;
  /** What the device delivers. */
  vout(t: number): number;
  /** Scope time at which the two peaks part company. */
  tClip: number;
}

/**
 * The numbers the lesson draws, separated from the drawing so a test can hold them to the
 * physics rather than to the picture.
 */
export function saturationModel(o: SaturationOptions = {}): SaturationModel {
  const Rin = o.Rin ?? SATURATION.Rin;
  const Rf = o.Rf ?? SATURATION.Rf;
  const vSat = o.vSat ?? SATURATION.vSat;
  const gain = -Rf / Rin;
  const { vFrom, vTo } = SATURATION;

  const envelope = (t: number) => vFrom + ((vTo - vFrom) * Math.min(SCOPE_T, Math.max(0, t))) / SCOPE_T;
  const vin = (t: number) => envelope(t) * Math.sin(2 * Math.PI * F_DRIVE * t);
  const ideal = (t: number) => gain * vin(t);
  const vout = (t: number) => Math.max(-vSat, Math.min(vSat, ideal(t)));
  // The peak the input must reach before the output stops following it.
  const vClip = vSat / Math.abs(gain);
  const tClip = (SCOPE_T * (vClip - vFrom)) / (vTo - vFrom);

  return { gain, vSat, scopeT: SCOPE_T, envelope, vin, ideal, vout, tClip };
}

export function buildSaturation(o: SaturationOptions = {}): SceneSpec {
  const Rin = o.Rin ?? SATURATION.Rin;
  const Rf = o.Rf ?? SATURATION.Rf;
  const m = saturationModel(o);
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const { vSupply, vOutAxis, vInAxis } = SATURATION;
  const G = Math.abs(m.gain);

  /* ---------------------------------------------------------------- schematic */
  const stage = invertingStage({
    id: "sat-sch",
    x: LAYOUT.schematic.x + 50,
    y: LAYOUT.schematic.y + 44,
    current: true,
    inputLabel: `R_in = ${fmtR(Rin)}`,
    feedbackLabel: `R_f = ${fmtR(Rf)}`,
    ...th,
  });
  const rails = supplyRails({ id: "sat-rails", stage, vPos: vSupply, vNeg: -vSupply, ...th });

  const circuit: Beat = {
    at: T_CIRCUIT,
    dur: 6,
    say: "The inverting stage again, ten k in and forty k back: a gain of minus four. What is new is drawn on the body. Two supply pins, plus and minus fifteen volts.",
    nodes: [
      withTracks(stage.node, fade(T_CIRCUIT)),
      withTracks(rails.node, fade(T_CIRCUIT + 2)),
      {
        id: "sat-supply-note",
        type: "text",
        x: LAYOUT.schematic.x + LAYOUT.schematic.w / 2,
        y: LAYOUT.schematic.y + LAYOUT.schematic.h - 6,
        text: "Every volt the output puts out comes from those two pins.",
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 16,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
        maxWidth: LAYOUT.schematic.w,
        tracks: fade(T_CIRCUIT + 3),
      },
    ],
  };

  /* ---------------------------------------------------------------- equations */
  const eqX = LAYOUT.equation.x;
  const ideal: Beat = {
    at: T_IDEAL,
    dur: 5,
    say: "The ideal formula has no end to it. Five volts in gives twenty out, and fifty volts in gives two hundred. Nothing in it knows where the output's energy comes from.",
    nodes: [
      equationPane({
        id: "sat-eq-ideal",
        latex: "v_{out}=-\\frac{R_f}{R_{in}}\\,v_{in}",
        x: eqX,
        y: LAYOUT.equation.y + 6,
        at: T_IDEAL,
        size: 27,
        ...th,
      }).node,
      equationPane({
        id: "sat-eq-clip",
        latex: `v_{out}=\\mathrm{clip}\\!\\left(-\\frac{R_f}{R_{in}}v_{in},\\ \\pm V_{sat}\\right)`,
        x: eqX,
        y: LAYOUT.equation.y + 86,
        at: T_SAT,
        size: 24,
        color: theme.palette.accent,
        ...th,
      }).node,
    ],
  };

  /* -------------------------------------------------------------------- scope */
  const toScope = (u: number) => (u * SCOPE_T) / RUN;
  const counterY = LAYOUT.equation.y + 178;
  const counter = (id: string, x: number, prefix: string, fn: (t: number) => number, fill: string): Node => ({
    id,
    type: "counter",
    x,
    y: counterY,
    value: Number(fn(0).toFixed(3)),
    decimals: 2,
    prefix,
    suffix: " V",
    fontFamily: LABEL_FONT,
    fontSize: 25,
    fill,
    align: "left",
    baseline: "middle",
    tracks: [valueTrack((u) => fn(toScope(u)), T_RUN, RUN, 48), ...fade(T_RUN - 0.4)],
  });

  const scope = scopePaneRaw({
    id: "sat-scope",
    x: LAYOUT.scope.x + 72,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 102,
    height: LAYOUT.scope.h - 26,
    tMax: SCOPE_T,
    samples: 1600,
    xLabel: "time",
    planes: [
      {
        label: "v_in",
        yMin: -vInAxis,
        yMax: vInAxis,
        yTicks: [-5, 0, 5],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "in", fn: m.vin, color: theme.palette.primary, start: T_RUN, duration: RUN, strokeWidth: 2.5 }],
      },
      {
        label: "v_out",
        yMin: -vOutAxis,
        yMax: vOutAxis,
        yTicks: [-m.vSat, 0, m.vSat],
        yTickLabel: (v) => `${v} V`,
        traces: [
          { id: "ideal", fn: m.ideal, color: theme.palette.muted, start: T_RUN, duration: RUN, strokeWidth: 2, dash: [6, 5] },
          { id: "out", fn: m.vout, color: theme.palette.accent, start: T_RUN, duration: RUN, strokeWidth: 2.8 },
        ],
      },
    ],
    ...th,
  });

  /* ------------------------------------------------------------ transfer view */
  const sweepX = (u: number) => -vInAxis + (2 * vInAxis * u) / SCOPE_T;
  const vtc = xyCurvePane({
    id: "sat-vtc",
    x: LAYOUT.transfer.x + 78,
    y: LAYOUT.transfer.y + 16,
    width: LAYOUT.transfer.w - 122,
    height: LAYOUT.transfer.h - 70,
    xMin: -vInAxis,
    xMax: vInAxis,
    yMin: -vOutAxis,
    yMax: vOutAxis,
    xTicks: [-5, 0, 5],
    yTicks: [-m.vSat, 0, m.vSat],
    xTickLabel: (v) => `${v} V`,
    yTickLabel: (v) => `${v} V`,
    xLabel: "v_in",
    yLabel: "v_out",
    uMax: SCOPE_T,
    samples: 400,
    traces: [
      {
        id: "ideal",
        at: (u) => ({ x: sweepX(u), y: m.gain * sweepX(u) }),
        color: theme.palette.muted,
        strokeWidth: 2,
        dash: [6, 5],
        start: T_IDEAL,
        duration: 1,
      },
      {
        id: "railp",
        at: (u) => ({ x: sweepX(u), y: m.vSat }),
        color: theme.palette.secondary,
        strokeWidth: 1.5,
        dash: [5, 4],
        start: T_SAT,
        duration: 0.6,
      },
      {
        id: "railn",
        at: (u) => ({ x: sweepX(u), y: -m.vSat }),
        color: theme.palette.secondary,
        strokeWidth: 1.5,
        dash: [5, 4],
        start: T_SAT,
        duration: 0.6,
      },
      {
        id: "line",
        at: (u) => {
          const x = sweepX(u);
          return { x, y: Math.max(-m.vSat, Math.min(m.vSat, m.gain * x)) };
        },
        color: theme.palette.primary,
        strokeWidth: 3.5,
        start: T_RUN - 0.5,
        duration: 1,
      },
    ],
    dots: [{ id: "dot", at: (u) => ({ x: m.vin(u), y: m.vout(u) }), color: theme.palette.accent, start: T_RUN, duration: RUN }],
    ...th,
  });
  /**
   * A rail's name, at the end of the rail the curve is not sitting on. The characteristic
   * is flat at +V_sat on the left and at −V_sat on the right, so each label takes the
   * opposite end and nothing lands on top of anything.
   */
  const railLabel = (id: string, v: number, text: string): Node => {
    const right = v > 0;
    const p = vtc.plane.toLocal(right ? vInAxis : -vInAxis, v);
    return {
      id,
      type: "text",
      x: LAYOUT.transfer.x + 78 + p.x + (right ? -8 : 8),
      y: LAYOUT.transfer.y + 16 + p.y - 13,
      text,
      fontFamily: LABEL_FONT,
      fontWeight: 700,
      fontSize: 14,
      fill: theme.palette.secondary,
      align: right ? "right" : "left",
      baseline: "middle",
      tracks: fade(T_SAT),
    };
  };

  const run: Beat = {
    at: T_RUN,
    dur: RUN,
    say: "Now turn the input up: one volt, climbing to five. Watch the two peak readings beside the equations.",
    nodes: [
      withTracks(scope.node, fade(T_RUN - 0.5)),
      withTracks(vtc.node, fade(T_IDEAL - 0.5)),
      counter("sat-ctr-vin", eqX, "V_in peak = ", m.envelope, theme.palette.primary),
      counter("sat-ctr-vout", eqX + 268, "V_out peak = ", (t) => Math.min(G * m.envelope(t), m.vSat), theme.palette.accent),
      railLabel("sat-lbl-railp", m.vSat, `+V_sat = +${m.vSat} V`),
      railLabel("sat-lbl-railn", -m.vSat, `−V_sat = −${m.vSat} V`),
    ],
  };

  const clip: Beat = {
    at: T_CLIP,
    dur: 5,
    say: "There. The input is still growing and the output has stopped. The peaks have gone flat and the dot has run into the rail.",
    nodes: [
      {
        id: "sat-clip-note",
        type: "text",
        x: LAYOUT.scope.x + LAYOUT.scope.w / 2 + 40,
        y: LAYOUT.scope.y - 16,
        text: `the two readings stop tracking at V_in = ${(m.vSat / G).toFixed(2)} V`,
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 17,
        fill: theme.palette.accent,
        align: "center",
        baseline: "middle",
        maxWidth: LAYOUT.scope.w,
        tracks: fade(T_CLIP),
      },
    ],
  };

  const sat: Beat = {
    at: T_SAT,
    dur: 5.5,
    say: `The limit is not fifteen. The output stage cannot reach its own supply, so it stops about two volts short, at thirteen. That number is V sat, and it is the only thing that changed.`,
    nodes: [
      {
        id: "sat-headroom",
        type: "text",
        x: eqX,
        y: LAYOUT.equation.y + 232,
        text: `rails ±${vSupply} V, but the output stops at ±${m.vSat} V`,
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 17,
        fill: theme.palette.secondary,
        align: "left",
        baseline: "middle",
        maxWidth: LAYOUT.equation.w,
        tracks: fade(T_SAT),
      },
    ],
  };

  const note: Beat = {
    at: T_NOTE,
    dur: 8,
    say: `Minus four is a promise the circuit keeps only up to three and a quarter volts in. Past that, the shape of the signal is gone.`,
    nodes: [
      {
        id: "sat-note",
        type: "text",
        x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
        y: LAYOUT.transfer.y + LAYOUT.transfer.h + 16,
        text: `Gain −${G} holds only while |v_in| < ${(m.vSat / G).toFixed(2)} V. Beyond it the shape is gone.`,
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 17,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
        maxWidth: LAYOUT.transfer.w + 40,
        tracks: fade(T_NOTE),
      },
    ],
  };

  return eeLesson({
    title: "Saturation: the straight line ends at the rails",
    beats: [circuit, ideal, run, clip, sat, note],
    ...th,
  });
}
