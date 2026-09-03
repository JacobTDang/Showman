/**
 * ee.impedancePhasors — the rotating arrow, and what impedance actually is.
 *
 * A sinusoid is the vertical shadow of a vector spinning at ω. Watch the arrow turn beside
 * the scope and the waveform stops being a formula. Then impedance: a capacitor's
 * 1/(jωC) shrinks as ω rises and an inductor's jωL grows, and the j is a quarter-turn on
 * the same picture. Where the two magnitudes cross is resonance.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { movingMarker, plotFunction } from "../../math/builders.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, logSweep, makePlane, phasorPane, scopePaneRaw, type Beat } from "./kit.js";
import { fade, fmtC, fmtL, fmtOmega, valueTrack, withTracks } from "./util.js";

export interface ImpedancePhasorsOptions {
  C?: number;
  L?: number;
  theme?: string;
}

const T_SPIN = 0.5;
const SPIN_DUR = 6;
const T_EQ = 7.5;
const T_Z = 11;
const Z_DUR = 8;
const T_NOTE = T_Z + Z_DUR + 1;

export function buildImpedancePhasors(o: ImpedancePhasorsOptions = {}): SceneSpec {
  const C = o.C ?? 100e-9;
  const L = o.L ?? 10e-3;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const omega0 = 1 / Math.sqrt(L * C);
  const zC = (w: number) => 1 / (w * C);
  const zL = (w: number) => w * L;

  // Beat 1 — the arrow and its shadow, on one clock. One turn every two seconds.
  const wDrawn = Math.PI;
  const phasor = phasorPane({
    id: "ip-phasor",
    cx: LAYOUT.schematic.x + 200,
    cy: LAYOUT.schematic.y + 135,
    radius: 95,
    omega: wDrawn,
    start: T_SPIN,
    duration: SPIN_DUR,
    label: "V·e^{jωt}, spinning at ω",
    ...th,
  });
  const scope = scopePaneRaw({
    id: "ip-scope",
    x: LAYOUT.scope.x + 60,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 80,
    height: LAYOUT.scope.h - 26,
    tMax: SPIN_DUR,
    xLabel: "time (s)",
    planes: [
      {
        label: "the arrow's height",
        yMin: -1.15,
        yMax: 1.15,
        yTicks: [-1, 0, 1],
        yTickLabel: (v) => `${v} V`,
        traces: [
          {
            id: "shadow",
            fn: (t) => Math.sin(wDrawn * t),
            color: theme.palette.accent,
            start: T_SPIN,
            duration: SPIN_DUR,
            marker: true,
            strokeWidth: 2.5,
          },
        ],
      },
    ],
    ...th,
  });
  const spin: Beat = {
    at: T_SPIN,
    dur: SPIN_DUR,
    say: "Here is a way to see a sinusoid instead of computing it. Spin an arrow at a steady rate, omega. Its height above the horizontal, moment by moment, is the waveform on the right. That arrow is a phasor.",
    nodes: [withTracks(phasor.node, fade(T_SPIN)), withTracks(scope.node, fade(T_SPIN))],
  };

  const eqX = LAYOUT.equation.x;
  const eq1 = equationPane({
    id: "ip-eq-euler",
    latex: "V e^{j\\omega t}=V\\cos\\omega t+jV\\sin\\omega t",
    x: eqX,
    y: LAYOUT.equation.y + 10,
    at: T_EQ,
    size: 23,
    ...th,
  });
  const eq2 = equationPane({
    id: "ip-eq-j",
    latex: "\\text{multiplying by } j \\text{ turns the arrow a quarter turn}",
    x: eqX,
    y: LAYOUT.equation.y + 65,
    at: T_EQ + 1.2,
    size: 19,
    color: theme.palette.accent,
    ...th,
  });
  const euler: Beat = {
    at: T_EQ,
    dur: 3,
    say: "Written as a complex number, the arrow is V e to the j omega t. Its imaginary part is the sine wave you just watched. And multiplying by j does one thing only: it turns the arrow a quarter turn.",
    nodes: [eq1.node, eq2.node],
  };

  // Beat 3 — |Z| against frequency, straight lines on log axes, crossing at resonance.
  const sweep = logSweep({ omega0, fromDecade: -1.5, toDecade: 1.5, duration: Z_DUR });
  const decades = [-1, 0, 1];
  const yLo = Math.floor(Math.log10(Math.min(zC(omega0 * 10 ** 1.5), zL(omega0 * 10 ** -1.5))));
  const yHi = Math.ceil(Math.log10(Math.max(zC(omega0 * 10 ** -1.5), zL(omega0 * 10 ** 1.5))));
  const yTicks: number[] = [];
  for (let e = yLo; e <= yHi; e++) yTicks.push(e);
  const ohms = (e: number) => (e >= 3 ? `${10 ** (e - 3)} kΩ` : `${10 ** e} Ω`);
  const zPlane = makePlane({
    id: "ip-z",
    x: 0,
    y: 0,
    width: LAYOUT.transfer.w - 100,
    height: LAYOUT.transfer.h - 70,
    xMin: -1.5,
    xMax: 1.5,
    yMin: yLo,
    yMax: yHi,
    xTicks: decades,
    yTicks,
    xTickLabel: (d) => (d === 0 ? "ω₀" : d === 1 ? "10ω₀" : "0.1ω₀"),
    yTickLabel: ohms,
    xLabel: "frequency (log scale)",
    yLabel: "|Z|",
    theme,
  });
  const zNodes: Node[] = [
    zPlane.node,
    plotFunction(
      zPlane,
      (d) => Math.log10(zC(omega0 * 10 ** d)),
      { samples: 100 },
      { id: "ip-zc", stroke: theme.palette.accent, strokeWidth: 2.5 },
    ),
    plotFunction(
      zPlane,
      (d) => Math.log10(zL(omega0 * 10 ** d)),
      { samples: 100 },
      { id: "ip-zl", stroke: theme.palette.secondary, strokeWidth: 2.5 },
    ),
    movingMarker(zPlane, (t) => ({ x: sweep.decadeAt(t), y: Math.log10(zC(sweep.omega(t))) }), {
      id: "ip-zc-dot",
      tMin: 0,
      tMax: Z_DUR,
      start: T_Z,
      duration: Z_DUR,
      samples: 200,
      radius: 6,
      fill: theme.palette.accent,
    }),
    movingMarker(zPlane, (t) => ({ x: sweep.decadeAt(t), y: Math.log10(zL(sweep.omega(t))) }), {
      id: "ip-zl-dot",
      tMin: 0,
      tMax: Z_DUR,
      start: T_Z,
      duration: Z_DUR,
      samples: 200,
      radius: 6,
      fill: theme.palette.secondary,
    }),
    {
      id: "ip-zc-lbl",
      type: "text",
      x: 12,
      y: 16,
      text: `capacitor, C = ${fmtC(C)}`,
      fontFamily: LABEL_FONT,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.accent,
      align: "left",
      baseline: "middle",
    },
    {
      id: "ip-zl-lbl",
      type: "text",
      x: 12,
      y: 34,
      text: `inductor, L = ${fmtL(L)}`,
      fontFamily: LABEL_FONT,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.secondary,
      align: "left",
      baseline: "middle",
    },
  ];
  const zPane: Node = withTracks(
    { id: "ip-zpane", type: "group", x: LAYOUT.transfer.x + 60, y: LAYOUT.transfer.y + 20, children: zNodes },
    fade(T_Z - 0.5),
  );
  const eqZ = equationPane({
    id: "ip-eq-z",
    latex: "Z_C=\\frac{1}{j\\omega C}\\qquad Z_L=j\\omega L",
    x: eqX,
    y: LAYOUT.equation.y + 120,
    at: T_Z,
    size: 25,
    ...th,
  });
  const counter = (id: string, x: number, prefix: string, fill: string, fn: (u: number) => number): Node => ({
    id,
    type: "counter",
    x,
    y: LAYOUT.equation.y + 200,
    value: Number(fn(0).toFixed(3)),
    decimals: 0,
    prefix,
    suffix: " Ω",
    fontFamily: LABEL_FONT,
    fontSize: 20,
    fill,
    align: "left",
    baseline: "middle",
    tracks: [valueTrack(fn, T_Z, Z_DUR), ...fade(T_Z)],
  });
  const impedance: Beat = {
    at: T_Z,
    dur: Z_DUR,
    say: "Now impedance. A capacitor's impedance is one over j omega C: as frequency rises it shrinks, a straight line falling on a log plot. An inductor's is j omega L: it grows. The j on each is that same quarter turn, in opposite directions. Where the two lines cross, they cancel — that is resonance, and it comes later.",
    nodes: [
      zPane,
      eqZ.node,
      counter("ip-ctr-zc", eqX, "|Z_C| = ", theme.palette.accent, (u) => zC(sweep.omega(u))),
      counter("ip-ctr-zl", eqX + 260, "|Z_L| = ", theme.palette.secondary, (u) => zL(sweep.omega(u))),
    ],
  };
  const noteBeat: Beat = {
    at: T_NOTE,
    dur: 4,
    say: `The two impedances are equal at omega naught, one over root L C — ${fmtOmega(omega0)} for these values. Impedance is not a resistance. It is a length and a quarter-turn, and it depends on frequency.`,
    nodes: [
      {
        id: "ip-note",
        type: "text",
        x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
        y: LAYOUT.transfer.y + LAYOUT.transfer.h + 18,
        text: `|Z_C| = |Z_L| at ω₀ = 1/√(LC) = ${fmtOmega(omega0)}.  Impedance is a length and a quarter-turn, and it moves with frequency.`,
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
    title: "Phasors and impedance: the arrow, and its length at each frequency",
    beats: [spin, euler, impedance, noteBeat],
    ...th,
  });
}
