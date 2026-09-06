/**
 * ee.opAmpRules — where the two ideal rules come from.
 *
 * The rules are usually handed over as assertions: no current into the inputs, and the two
 * inputs are at the same voltage. Neither is obvious, and the second sounds like a lie —
 * the inputs are plainly wired to different things. So this lesson derives it from the one
 * number the datasheet gives you. The open-loop gain is two hundred thousand, and the
 * output cannot leave ±13 V, so the entire range of input differences that produces an
 * output at all is 65 microvolts wide. Drive the bare device with five volts and it does
 * the only thing it can: slam to a rail and stay there.
 *
 * Then the loop closes, and the same enormous gain runs backwards. The output moves until
 * the difference at the inputs is back inside those 65 microvolts — which, on any scale you
 * can see, means the two inputs are equal. The scope shows v− being dragged onto v+ as it
 * happens, and the transfer view shows the operating point leaving the rail and settling on
 * the vertical line at the centre.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, xyCurvePane, type Beat } from "./kit.js";
import { nonInvertingStage } from "./opAmpSchematics.js";
import { fade, fadeBetween, valueTrack, withTracks } from "./util.js";

/** The device the lesson models: a 741-class DC gain into ±15 V rails. */
export const OPEN_LOOP = {
  /** Open-loop DC gain, volts per volt. */
  A: 200_000,
  /** How far the output can swing before it is stuck at the rail, volts. */
  vSat: 13,
} as const;

export interface OpAmpRulesOptions {
  /** Feedback resistor, ohms. Default 10 kΩ. */
  Rf?: number;
  /** Resistor from the inverting node to the common rail, ohms. Default 10 kΩ. */
  Rg?: number;
  theme?: string;
}

const T_DEVICE = 0.5;
const T_OPEN = 5.5;
const T_CLOSE = 12.5;
const T_RULES = 19.5;
const T_NOTE = 25;
const TRACE = 5.5;
/** Seconds on the scope's time axis, and two cycles of the drive across them. */
const SCOPE_T = 4;
const F_DRIVE = 0.5;
/** Input amplitude at v+, volts. */
const V_DRIVE = 5;

export function buildOpAmpRules(o: OpAmpRulesOptions = {}): SceneSpec {
  const Rf = o.Rf ?? 10e3;
  const Rg = o.Rg ?? 10e3;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const { A, vSat } = OPEN_LOOP;
  const closedGain = 1 + Rf / Rg;
  const microvolts = Math.round((vSat / A) * 1e6);

  const clip = (v: number) => Math.max(-vSat, Math.min(vSat, v));
  const plus = (t: number) => V_DRIVE * Math.sin(2 * Math.PI * F_DRIVE * t);
  // Open loop: v− is tied to the common rail, so the difference is the whole input.
  const openOut = (t: number) => clip(A * plus(t));
  // Closed loop: the output settles where the divider puts v− back onto v+.
  const closedOut = (t: number) => closedGain * plus(t);
  const closedDiff = (t: number) => closedOut(t) / A;

  /* ---------------------------------------------------------------- schematic */
  const stage = nonInvertingStage({
    id: "or-sch",
    x: LAYOUT.schematic.x + 55,
    y: LAYOUT.schematic.y + 28,
    current: true,
    revealAt: T_CLOSE,
    rfLabel: `R_f = ${Rf / 1000} kΩ`,
    rgLabel: `R_g = ${Rg / 1000} kΩ`,
    ...th,
  });
  const terminalLabel = (id: string, y: number, text: string, fill: string): Node =>
    withTracks(
      {
        id,
        type: "text",
        x: stage.points.plus.x - 30,
        y,
        text,
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 16,
        fill,
        align: "right",
        baseline: "middle",
      },
      fadeBetween(T_DEVICE, T_CLOSE),
    );
  const device: Beat = {
    at: T_DEVICE,
    dur: 4.5,
    say: "An op amp on its own. It looks at the difference between its two inputs and multiplies it. The multiplier, A, is not a modest number.",
    nodes: [
      withTracks(stage.node, fade(T_DEVICE)),
      terminalLabel("or-lbl-minus", stage.points.summing.y, "v−", theme.palette.secondary),
      terminalLabel("or-lbl-plus", stage.points.plus.y, "v+", theme.palette.primary),
      equationPane({
        id: "or-eq-model",
        latex: "v_{out}=A\\,(v_+-v_-)",
        x: LAYOUT.equation.x,
        y: LAYOUT.equation.y + 6,
        at: T_DEVICE,
        size: 27,
        ...th,
      }).node,
      {
        id: "or-ctr-a",
        type: "counter",
        x: LAYOUT.equation.x,
        y: LAYOUT.equation.y + 72,
        value: 0,
        decimals: 0,
        prefix: "A = ",
        suffix: " V/V",
        fontFamily: LABEL_FONT,
        fontSize: 24,
        fill: theme.palette.accent,
        align: "left",
        baseline: "middle",
        tracks: [valueTrack((u) => (A * u) / 3.5, T_DEVICE + 0.5, 3.5), ...fade(T_DEVICE + 0.5)],
      },
    ],
  };

  /* -------------------------------------------------------------------- scope */
  const scope = (id: string, minus: (t: number) => number, out: (t: number) => number, start: number) =>
    scopePaneRaw({
      id,
      x: LAYOUT.scope.x + 66,
      y: LAYOUT.scope.y + 8,
      width: LAYOUT.scope.w - 96,
      height: LAYOUT.scope.h - 26,
      tMax: SCOPE_T,
      samples: 900,
      xLabel: "time",
      planes: [
        {
          label: "inputs",
          yMin: -6.5,
          yMax: 6.5,
          yTicks: [-5, 0, 5],
          yTickLabel: (v) => `${v} V`,
          traces: [
            { id: "plus", fn: plus, color: theme.palette.primary, start, duration: TRACE, strokeWidth: 2.5 },
            { id: "minus", fn: minus, color: theme.palette.secondary, start, duration: TRACE, dash: [7, 5], strokeWidth: 2.5 },
          ],
        },
        {
          label: "v_out",
          yMin: -15,
          yMax: 15,
          yTicks: [-13, 0, 13],
          yTickLabel: (v) => `${v} V`,
          traces: [{ id: "out", fn: out, color: theme.palette.accent, start, duration: TRACE, strokeWidth: 2.5 }],
        },
      ],
      ...th,
    });
  const openScope = scope("or-scope-open", () => 0, openOut, T_OPEN);
  const closedScope = scope("or-scope-closed", plus, closedOut, T_CLOSE + 0.6);

  /* ------------------------------------------------------------ transfer view */
  const vAxis = 0.01; // ±10 mV across, which the 65 µV linear range is invisible inside
  const vtc = xyCurvePane({
    id: "or-vtc",
    x: LAYOUT.transfer.x + 76,
    y: LAYOUT.transfer.y + 14,
    width: LAYOUT.transfer.w - 116,
    height: LAYOUT.transfer.h - 66,
    xMin: -vAxis,
    xMax: vAxis,
    yMin: -15,
    yMax: 15,
    xTicks: [-vAxis, 0, vAxis],
    yTicks: [-13, 0, 13],
    xTickLabel: (v) => `${(v * 1000).toFixed(0)} mV`,
    yTickLabel: (v) => `${v} V`,
    xLabel: "v+ − v−",
    yLabel: "v_out",
    uMax: SCOPE_T,
    samples: 600,
    traces: [
      {
        id: "line",
        at: (u) => {
          const vd = -vAxis + (2 * vAxis * u) / SCOPE_T;
          return { x: vd, y: clip(A * vd) };
        },
        color: theme.palette.primary,
        strokeWidth: 3,
        start: T_OPEN,
        duration: 1.2,
      },
    ],
    dots: [
      {
        id: "dot-open",
        at: (u) => ({ x: plus(u), y: openOut(u) }),
        color: theme.palette.accent,
        start: T_OPEN,
        duration: TRACE,
        until: T_CLOSE,
      },
      {
        id: "dot-closed",
        at: (u) => ({ x: closedDiff(u), y: closedOut(u) }),
        color: theme.palette.secondary,
        start: T_CLOSE + 0.6,
        duration: TRACE,
      },
    ],
    ...th,
  });

  const openBeat: Beat = {
    at: T_OPEN,
    dur: 6.5,
    say: `Drive the plus input with a five volt sine and hold the minus input at zero. Five volts times two hundred thousand is a million volts, and the output can only reach thirteen. So it slams to one rail, then the other.`,
    nodes: [
      withTracks(openScope.node, fadeBetween(T_OPEN - 0.5, T_CLOSE)),
      withTracks(vtc.node, fade(T_OPEN - 0.5)),
      {
        id: "or-vtc-note",
        type: "text",
        x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
        y: LAYOUT.transfer.y + LAYOUT.transfer.h + 12,
        text: `Across this box the output goes rail to rail: the whole linear range is ±${microvolts} µV wide.`,
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 16,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
        maxWidth: LAYOUT.transfer.w + 40,
        tracks: fadeBetween(T_OPEN + 1, T_NOTE),
      },
    ],
  };

  /* --------------------------------------------------------- closing the loop */
  const closeBeat: Beat = {
    at: T_CLOSE,
    dur: 6.5,
    say: "Now close the loop: send part of the output back to the minus input. Watch the minus trace. It stops sitting at zero and lands exactly on the plus trace, and the output becomes a clean sinusoid instead of a square.",
    nodes: [withTracks(closedScope.node, fade(T_CLOSE))],
  };

  const eqRules = equationPane({
    id: "or-eq-rules",
    latex: "i_+=i_-=0\\qquad v_-=v_+",
    x: LAYOUT.equation.x,
    y: LAYOUT.equation.y + 130,
    at: T_RULES,
    size: 30,
    color: theme.palette.accent,
    ...th,
  });
  const rulesNote: Node = {
    id: "or-rules-note",
    type: "text",
    x: LAYOUT.equation.x,
    y: LAYOUT.equation.y + 210,
    text: `Closed loop, the inputs differ by v_out/A — about ${Math.round((closedGain * V_DRIVE * 1e6) / A)} µV at full output.`,
    fontFamily: LABEL_FONT,
    fontSize: 17,
    fill: theme.palette.text,
    align: "left",
    baseline: "middle",
    maxWidth: LAYOUT.equation.w,
    tracks: fade(T_RULES + 0.5),
  };
  const rulesBeat: Beat = {
    at: T_RULES,
    dur: 5,
    say: "That gives the two rules. No current flows into either input, because the inputs are the gates of transistors. And the minus input is dragged to whatever the plus input is, because the feedback moves the output until it is.",
    nodes: [eqRules.node, rulesNote],
  };

  const note: Node = {
    id: "or-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 12,
    text: "Plus input driven: a virtual short.  Plus input grounded: a virtual ground.",
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
    say: "Drive the plus input and the pair is a virtual short. Ground it, and the minus input sits at zero without being wired to anything: a virtual ground.",
    nodes: [note],
  };

  return eeLesson({
    title: "The ideal op-amp: where the two rules come from",
    beats: [device, openBeat, closeBeat, rulesBeat, noteBeat],
    ...th,
  });
}
