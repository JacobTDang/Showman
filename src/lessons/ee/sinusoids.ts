/**
 * ee.sinusoids — the three knobs on a sinusoid, turned one at a time.
 *
 * v(t) = A sin(2πft + φ). Change only A and the wave grows taller; only f and it bunches
 * up; only φ and it slides sideways. Each change is drawn beside the same reference so
 * the eye sees what moved and what did not — because everything in this course is a
 * sinusoid going in and a scaled, shifted sinusoid coming out.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { acSource } from "../../physics/circuit.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, type Beat } from "./kit.js";
import { fade, stepTrack, withTracks } from "./util.js";

export interface SinusoidsOptions {
  theme?: string;
}

const T_REF = 0.5;
const T_AMP = 4.5;
const T_FREQ = 9;
const T_PHASE = 13.5;
const BEAT = 3.5;
const T_NOTE = T_PHASE + BEAT + 1;
const T_AXIS = 3;

export function buildSinusoids(o: SinusoidsOptions = {}): SceneSpec {
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const TWO_PI = 2 * Math.PI;
  const ref = (t: number) => Math.sin(TWO_PI * t);
  const amp = (t: number) => 2 * Math.sin(TWO_PI * t);
  const freq = (t: number) => Math.sin(TWO_PI * 2 * t);
  const phase = (t: number) => Math.sin(TWO_PI * t + Math.PI / 2);

  // The source: a signal generator, drawn large.
  const gen = acSource({ id: "sn-gen", x: 0, y: 0, size: 90, color: theme.palette.text });
  const source: Node = {
    id: "sn-source",
    type: "group",
    x: LAYOUT.schematic.x + 200,
    y: LAYOUT.schematic.y + 110,
    scale: 1.6,
    tracks: fade(T_REF),
    children: [
      gen.node,
      {
        id: "sn-gen-lbl",
        type: "text",
        x: 45,
        y: 62,
        text: "signal generator",
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 11,
        fill: theme.palette.muted,
        align: "center",
        baseline: "middle",
      },
      {
        id: "sn-gen-out",
        type: "text",
        x: 128,
        y: 0,
        text: "v(t) →",
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 13,
        fill: theme.palette.primary,
        align: "center",
        baseline: "middle",
      },
    ],
  };

  const eqX = LAYOUT.equation.x;
  const eqRef = equationPane({
    id: "sn-eq",
    latex: "v(t)=A\\sin(2\\pi f t+\\phi)",
    x: eqX,
    y: LAYOUT.equation.y + 10,
    at: T_REF,
    size: 28,
    ...th,
  });
  const eqA = equationPane({
    id: "sn-eq-a",
    latex: "A:\\;2\\,\\mathrm{V}\\;\\text{(was 1 V)}",
    x: eqX,
    y: LAYOUT.equation.y + 80,
    at: T_AMP,
    size: 22,
    color: theme.palette.accent,
    ...th,
  });
  const eqF = equationPane({
    id: "sn-eq-f",
    latex: "f:\\;2\\,\\mathrm{Hz}\\;\\text{(was 1 Hz)}",
    x: eqX,
    y: LAYOUT.equation.y + 130,
    at: T_FREQ,
    size: 22,
    color: theme.palette.secondary,
    ...th,
  });
  const eqP = equationPane({
    id: "sn-eq-p",
    latex: "\\phi:\\;+90^{\\circ}\\;\\text{(was 0)}",
    x: eqX,
    y: LAYOUT.equation.y + 180,
    at: T_PHASE,
    size: 22,
    color: theme.palette.primary,
    ...th,
  });

  const scope = scopePaneRaw({
    id: "sn-scope",
    x: LAYOUT.scope.x + 60,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 80,
    height: LAYOUT.scope.h - 26,
    tMax: T_AXIS,
    xLabel: "time (s)",
    planes: [
      {
        label: "v(t)",
        yMin: -2.3,
        yMax: 2.3,
        yTicks: [-2, -1, 0, 1, 2],
        yTickLabel: (v) => `${v} V`,
        traces: [
          { id: "ref", fn: ref, color: theme.palette.muted, start: T_REF, duration: 2.5, dash: [6, 4], strokeWidth: 2 },
          { id: "amp", fn: amp, color: theme.palette.accent, start: T_AMP, duration: 2.5, marker: true, strokeWidth: 2.5 },
          { id: "freq", fn: freq, color: theme.palette.secondary, start: T_FREQ, duration: 2.5, marker: true, strokeWidth: 2.5 },
          { id: "phase", fn: phase, color: theme.palette.primary, start: T_PHASE, duration: 2.5, marker: true, strokeWidth: 2.5 },
        ],
      },
    ],
    ...th,
  });

  // The three knobs, read live.
  const knob = (
    id: string,
    y: number,
    prefix: string,
    suffix: string,
    fill: string,
    steps: Array<{ at: number; value: number }>,
    decimals = 0,
  ): Node => ({
    id,
    type: "counter",
    x: LAYOUT.transfer.x + 80,
    y,
    value: steps[0]!.value,
    decimals,
    prefix,
    suffix,
    fontFamily: LABEL_FONT,
    fontSize: 26,
    fill,
    align: "left",
    baseline: "middle",
    tracks: [stepTrack(steps), ...fade(T_REF)],
  });
  const knobs: Node[] = [
    {
      id: "sn-knobs-t",
      type: "text",
      x: LAYOUT.transfer.x + 80,
      y: LAYOUT.transfer.y + 30,
      text: "the three knobs",
      fontFamily: LABEL_FONT,
      fontWeight: 700,
      fontSize: 16,
      fill: theme.palette.muted,
      align: "left",
      baseline: "middle",
      tracks: fade(T_REF),
    },
    knob("sn-knob-a", LAYOUT.transfer.y + 85, "amplitude A = ", " V", theme.palette.accent, [
      { at: T_REF, value: 1 },
      { at: T_AMP, value: 2 },
      { at: T_FREQ, value: 1 },
    ]),
    knob("sn-knob-f", LAYOUT.transfer.y + 145, "frequency f = ", " Hz", theme.palette.secondary, [
      { at: T_REF, value: 1 },
      { at: T_FREQ, value: 2 },
      { at: T_PHASE, value: 1 },
    ]),
    knob("sn-knob-p", LAYOUT.transfer.y + 205, "phase φ = ", "°", theme.palette.primary, [
      { at: T_REF, value: 0 },
      { at: T_PHASE, value: 90 },
    ]),
  ];

  const beats: Beat[] = [
    {
      at: T_REF,
      dur: 3,
      say: "Everything in this course rides on one waveform. A sinusoid has exactly three knobs: amplitude, frequency, and phase. Here is the reference: one volt, one hertz, zero phase.",
      nodes: [source, eqRef.node, withTracks(scope.node, fade(T_REF)), ...knobs],
    },
    {
      at: T_AMP,
      dur: BEAT,
      say: "Turn up the amplitude to two volts. The wave grows taller and nothing else changes: same period, same zero crossings.",
      nodes: [eqA.node],
    },
    {
      at: T_FREQ,
      dur: BEAT,
      say: "Put the amplitude back and double the frequency. Now it bunches up: two cycles where there was one. The height is untouched.",
      nodes: [eqF.node],
    },
    {
      at: T_PHASE,
      dur: BEAT,
      say: "Back to one hertz, and add ninety degrees of phase. The wave slides left by a quarter cycle — it starts at its peak instead of at zero. A sine with ninety degrees of phase is a cosine.",
      nodes: [eqP.node],
    },
    {
      at: T_NOTE,
      dur: 4,
      say: "Hold on to this. A linear circuit can only ever change the amplitude and the phase. It never changes the frequency. That is the whole reason the next lessons work.",
      nodes: [
        {
          id: "sn-note",
          type: "text",
          x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
          y: LAYOUT.transfer.y + LAYOUT.transfer.h + 18,
          text: "A linear circuit turns only two of the three knobs: amplitude and phase.  Frequency comes out unchanged.",
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
    },
  ];
  return eeLesson({ title: "Sinusoids: three knobs, and only two of them ever move", beats, ...th });
}
