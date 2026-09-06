/**
 * ee.invertingAmp — the inverting stage, and where its gain comes from.
 *
 * Two rules and two resistors give the whole answer. The inverting node is a virtual
 * ground, so the input current is v_in/R_in and nothing else. No current goes into the op
 * amp, so all of it continues through R_f. A current i through R_f from a node at zero
 * volts puts the far end at −i·R_f. Hence v_out/v_in = −R_f/R_in: a ratio of two
 * resistors, and nothing about the op amp at all.
 *
 * Which is why changing one resistor changes everything at once. Halfway through, R_f
 * doubles: the counter reads the new gain, the transfer line tips to a steeper slope, and
 * the output on the scope grows to match — one change, three views.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, xyCurvePane, type Beat } from "./kit.js";
import { invertingStage } from "./opAmpSchematics.js";
import { fade, fadeBetween, fmtR, stepTrack, withTracks } from "./util.js";

export interface InvertingAmpOptions {
  /** Input resistor, ohms. Default 10 kΩ. */
  Rin?: number;
  /** Feedback resistor before the change, ohms. Default 20 kΩ. */
  Rf1?: number;
  /** Feedback resistor after the change, ohms. Default 40 kΩ. */
  Rf2?: number;
  theme?: string;
}

const T_CIRCUIT = 0.5;
const T_RULES = 5;
const T_RUN = 10;
const T_CHANGE = 18;
const T_NOTE = 26;
const RUN = 7;
/** Seconds on the scope's time axis: two cycles of the drive. */
const SCOPE_T = 4;
const F_DRIVE = 0.5;
/** Input amplitude, volts. */
const V_IN = 2;

export function buildInvertingAmp(o: InvertingAmpOptions = {}): SceneSpec {
  const Rin = o.Rin ?? 10e3;
  const Rf1 = o.Rf1 ?? 20e3;
  const Rf2 = o.Rf2 ?? 40e3;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const gain1 = -Rf1 / Rin;
  const gain2 = -Rf2 / Rin;
  /** Input axis half-range, and the output axis the larger gain needs at full input. */
  const vAxis = V_IN * 1.15;
  const outAxis = Math.abs(gain2) * vAxis;

  const vin = (t: number) => V_IN * Math.sin(2 * Math.PI * F_DRIVE * t);

  /* ---------------------------------------------------------------- schematic */
  const stage = invertingStage({
    id: "ia-sch",
    x: LAYOUT.schematic.x + 55,
    y: LAYOUT.schematic.y + 50,
    current: true,
    inputLabel: `R_in = ${fmtR(Rin)}`,
    feedbackLabel: "R_f",
    ...th,
  });
  /** The feedback value sits on the part, and is replaced in place when the part changes. */
  const rfValue = (id: string, text: string, tracks: Node["tracks"]): Node => ({
    id,
    type: "text",
    x: stage.points.feedback.x,
    y: stage.points.feedback.y - 42,
    text,
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 16,
    fill: theme.palette.accent,
    align: "center",
    baseline: "middle",
    tracks,
  });
  const circuit: Beat = {
    at: T_CIRCUIT,
    dur: 4,
    say: "The inverting stage. The input goes through R in to the minus terminal, and R f runs from that same node back to the output. The plus terminal is grounded.",
    nodes: [
      withTracks(stage.node, fade(T_CIRCUIT)),
      rfValue("ia-rf-1", fmtR(Rf1), fadeBetween(T_CIRCUIT, T_CHANGE)),
      rfValue("ia-rf-2", fmtR(Rf2), fade(T_CHANGE + 0.4)),
      {
        id: "ia-vg",
        type: "text",
        x: stage.points.summing.x - 10,
        y: stage.points.summing.y + 24,
        text: "0 V",
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 15,
        fill: theme.palette.secondary,
        align: "right",
        baseline: "middle",
        tracks: fade(T_RULES),
      },
    ],
  };

  /* ---------------------------------------------------------------- equations */
  const eqX = LAYOUT.equation.x;
  const rules: Beat = {
    at: T_RULES,
    dur: 5,
    say: "The plus terminal is at zero, so the minus terminal is too: a virtual ground. The input current is therefore v in over R in. None of it enters the op amp, so all of it goes through R f, and the output has to sit that far below zero.",
    nodes: [
      equationPane({
        id: "ia-eq-i",
        latex: "i=\\frac{v_{in}}{R_{in}}=-\\frac{v_{out}}{R_f}",
        x: eqX,
        y: LAYOUT.equation.y + 6,
        at: T_RULES,
        size: 25,
        ...th,
      }).node,
      equationPane({
        id: "ia-eq-gain",
        latex: "\\frac{v_{out}}{v_{in}}=-\\frac{R_f}{R_{in}}",
        x: eqX,
        y: LAYOUT.equation.y + 92,
        at: T_RULES + 1.5,
        size: 30,
        color: theme.palette.accent,
        ...th,
      }).node,
      {
        id: "ia-ctr-gain",
        type: "counter",
        x: eqX,
        y: LAYOUT.equation.y + 190,
        value: gain1,
        decimals: 1,
        prefix: "gain = ",
        suffix: " V/V",
        fontFamily: LABEL_FONT,
        fontSize: 26,
        fill: theme.palette.accent,
        align: "left",
        baseline: "middle",
        tracks: [
          stepTrack([
            { at: T_RUN, value: gain1 },
            { at: T_CHANGE, value: gain2 },
          ]),
          ...fade(T_RUN),
        ],
      },
      {
        id: "ia-ctr-rf",
        type: "counter",
        x: eqX + 250,
        y: LAYOUT.equation.y + 190,
        value: Rf1 / 1000,
        decimals: 0,
        prefix: "R_f = ",
        suffix: " kΩ",
        fontFamily: LABEL_FONT,
        fontSize: 26,
        fill: theme.palette.secondary,
        align: "left",
        baseline: "middle",
        tracks: [
          stepTrack([
            { at: T_RUN, value: Rf1 / 1000 },
            { at: T_CHANGE, value: Rf2 / 1000 },
          ]),
          ...fade(T_RUN),
        ],
      },
    ],
  };

  /* -------------------------------------------------------------------- scope */
  const vTicks = [-Math.abs(gain2) * V_IN, 0, Math.abs(gain2) * V_IN];
  const scope = scopePaneRaw({
    id: "ia-scope",
    x: LAYOUT.scope.x + 70,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 100,
    height: LAYOUT.scope.h - 26,
    tMax: SCOPE_T,
    samples: 900,
    xLabel: "time",
    planes: [
      {
        label: "v_in",
        yMin: -outAxis,
        yMax: outAxis,
        yTicks: [-V_IN, 0, V_IN],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "in", fn: vin, color: theme.palette.primary, start: T_RUN, duration: RUN, strokeWidth: 2.5 }],
      },
      {
        label: "v_out",
        yMin: -outAxis,
        yMax: outAxis,
        yTicks: vTicks,
        yTickLabel: (v) => `${v} V`,
        traces: [
          { id: "out1", fn: (t) => gain1 * vin(t), color: theme.palette.accent, start: T_RUN, duration: RUN, strokeWidth: 2.5 },
          { id: "out2", fn: (t) => gain2 * vin(t), color: theme.palette.secondary, start: T_CHANGE, duration: RUN, strokeWidth: 2.5 },
        ],
      },
    ],
    ...th,
  });

  /* ------------------------------------------------------------ transfer view */
  const line = (gain: number) => (u: number) => {
    const x = -vAxis + (2 * vAxis * u) / SCOPE_T;
    return { x, y: gain * x };
  };
  const vtc = xyCurvePane({
    id: "ia-vtc",
    x: LAYOUT.transfer.x + 76,
    y: LAYOUT.transfer.y + 14,
    width: LAYOUT.transfer.w - 116,
    height: LAYOUT.transfer.h - 66,
    xMin: -vAxis,
    xMax: vAxis,
    yMin: -outAxis,
    yMax: outAxis,
    xTicks: [-V_IN, 0, V_IN],
    yTicks: vTicks,
    xTickLabel: (v) => `${v} V`,
    yTickLabel: (v) => `${v} V`,
    xLabel: "v_in",
    yLabel: "v_out",
    legendAt: "bottom",
    uMax: SCOPE_T,
    samples: 200,
    traces: [
      { id: "g1", at: line(gain1), color: theme.palette.accent, strokeWidth: 3, start: T_RUN, duration: 1, label: `slope ${gain1}` },
      { id: "g2", at: line(gain2), color: theme.palette.secondary, strokeWidth: 3, start: T_CHANGE, duration: 1, label: `slope ${gain2}` },
    ],
    dots: [
      {
        id: "dot1",
        at: (u) => ({ x: vin(u), y: gain1 * vin(u) }),
        color: theme.palette.accent,
        start: T_RUN,
        duration: RUN,
        until: T_CHANGE,
      },
      { id: "dot2", at: (u) => ({ x: vin(u), y: gain2 * vin(u) }), color: theme.palette.secondary, start: T_CHANGE, duration: RUN },
    ],
    ...th,
  });

  const run: Beat = {
    at: T_RUN,
    dur: RUN,
    say: `Two volts in. R f over R in is ${Math.abs(gain1)}, so the output is ${Math.abs(gain1) * V_IN} volts — and upside down. Every time the input goes up, the output goes down, and the dot slides down a straight line of negative slope.`,
    nodes: [withTracks(scope.node, fade(T_RUN - 0.5)), withTracks(vtc.node, fade(T_RUN - 0.5))],
  };

  const changeNote: Node = {
    id: "ia-change",
    type: "text",
    x: LAYOUT.schematic.x + LAYOUT.schematic.w / 2,
    y: LAYOUT.schematic.y + LAYOUT.schematic.h - 4,
    text: `R_f: ${fmtR(Rf1)} → ${fmtR(Rf2)}`,
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 18,
    fill: theme.palette.secondary,
    align: "center",
    baseline: "middle",
    tracks: fade(T_CHANGE),
  };
  const change: Beat = {
    at: T_CHANGE,
    dur: RUN,
    say: `Now double R f, and change nothing else. The gain goes to ${gain2}. The line tips over to a steeper slope, and on the scope the output grows to ${Math.abs(gain2) * V_IN} volts. One resistor, and all three views move together.`,
    nodes: [changeNote],
  };

  const note: Node = {
    id: "ia-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 14,
    text: "The gain is a ratio of two resistors. Nothing in it belongs to the op amp.",
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
    say: "That is the whole design. Pick two resistors and you have picked the gain. The op amp's own gain, whatever it happens to be, never appears in the answer.",
    nodes: [note],
  };

  return eeLesson({
    title: "The inverting amplifier: gain is a ratio of two resistors",
    beats: [circuit, rules, run, change, noteBeat],
    ...th,
  });
}
