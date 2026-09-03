/**
 * ee.polesStepResponse — where the pole is, and what it does to the step response.
 *
 * T(s) = 1/(1 + sτ) has one pole at s = −1/τ. A step in gives V(1 − e^{−t/τ}) out, and
 * 63% of the way there takes exactly τ. Slide the pole left — a smaller τ — and the same
 * step is answered faster. The s-plane and the time-domain are two views of one number.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, sPlanePane, scopePaneRaw, type Beat } from "./kit.js";
import { rcSchematic } from "./schematics.js";
import { fade, fmtC, fmtR, fmtTau, stepTrack, withTracks } from "./util.js";

export interface PolesStepOptions {
  R?: number;
  C?: number;
  /** How much smaller the second time constant is. Default 3. */
  speedup?: number;
  theme?: string;
}

const T_CIRCUIT = 0.5;
const T_EQ = 4;
const T_STEP1 = 8.5;
const T_MOVE = 13;
const T_STEP2 = 14.5;
const STEP_DUR = 3.5;
const T_NOTE = T_STEP2 + STEP_DUR + 1;
/** The scope's time axis, in units of the first time constant. */
const T_AXIS = 5;

export function buildPolesStepResponse(o: PolesStepOptions = {}): SceneSpec {
  const R = o.R ?? 1000;
  const C = o.C ?? 100e-9;
  const speedup = o.speedup ?? 3;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const tau1 = R * C;
  const tau2 = tau1 / speedup;
  // Time on the scope is in units of tau1, so the first response has tau = 1.
  const step1 = (t: number) => 1 - Math.exp(-t);
  const step2 = (t: number) => 1 - Math.exp(-t * speedup);

  const sch = rcSchematic({
    id: "ps-sch",
    x: LAYOUT.schematic.x + 110,
    y: LAYOUT.schematic.y + 20,
    series: "R",
    rLabel: `R = ${fmtR(R)}`,
    cLabel: `C = ${fmtC(C)}`,
    current: true,
    ...th,
  });
  const circuit: Beat = {
    at: T_CIRCUIT,
    dur: 3,
    say: "The same RC lowpass. Instead of a sinusoid, apply a step: the input jumps from zero to V and stays there. What does the capacitor voltage do?",
    nodes: [withTracks(sch.node, fade(T_CIRCUIT))],
  };

  const eqX = LAYOUT.equation.x;
  const eq1 = equationPane({
    id: "ps-eq-T",
    latex: "T(s)=\\frac{1}{1+s\\tau},\\qquad \\tau=RC",
    x: eqX,
    y: LAYOUT.equation.y + 10,
    at: T_EQ,
    size: 24,
    ...th,
  });
  const eq2 = equationPane({
    id: "ps-eq-pole",
    latex: "\\text{pole at } s=-\\frac{1}{\\tau}",
    x: eqX,
    y: LAYOUT.equation.y + 70,
    at: T_EQ + 1.2,
    size: 24,
    color: theme.palette.accent,
    ...th,
  });
  const eq3 = equationPane({
    id: "ps-eq-step",
    latex: "v_C(t)=V\\left(1-e^{-t/\\tau}\\right)",
    x: eqX,
    y: LAYOUT.equation.y + 130,
    at: T_EQ + 2.4,
    size: 24,
    ...th,
  });
  const equations: Beat = {
    at: T_EQ,
    dur: 4,
    say: "Write the transfer function with tau equals R C. The denominator is zero at s equals minus one over tau: that is the pole. And the step response is V times one minus e to the minus t over tau.",
    nodes: [eq1.node, eq2.node, eq3.node],
  };

  const splane = sPlanePane({
    id: "ps-splane",
    x: LAYOUT.transfer.x + 60,
    y: LAYOUT.transfer.y + 20,
    width: LAYOUT.transfer.w - 100,
    height: LAYOUT.transfer.h - 70,
    sigmaMin: -Math.ceil(speedup) - 1,
    poles: [{ id: "pole", sigma: -1, omega: 0, label: "−1/τ", moveTo: { sigma: -speedup, at: T_MOVE, dur: 1.2 } }],
    ...th,
  });
  const scope = scopePaneRaw({
    id: "ps-scope",
    x: LAYOUT.scope.x + 60,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 80,
    height: LAYOUT.scope.h - 26,
    tMax: T_AXIS,
    xLabel: "time, in units of τ₁",
    planes: [
      {
        label: "v_C(t) / V",
        yMin: 0,
        yMax: 1.12,
        yTicks: [0, 0.632, 1],
        yTickLabel: (v) => (v === 0.632 ? "63%" : v === 1 ? "V" : "0"),
        traces: [
          { id: "step1", fn: step1, color: theme.palette.primary, start: T_STEP1, duration: STEP_DUR, marker: true, strokeWidth: 2.5 },
          { id: "step2", fn: step2, color: theme.palette.accent, start: T_STEP2, duration: STEP_DUR, marker: true, strokeWidth: 2.5 },
        ],
      },
    ],
    ...th,
  });
  // A dashed guide at τ = 1 on the time axis, where the first response is at 63%.
  const plane = scope.planes[0]!;
  const tauX = plane.originX + plane.toLocal(1, 0).x;
  const guide: Node = {
    id: "ps-tau-guide",
    type: "polyline",
    x: 0,
    y: 0,
    points: [
      { x: tauX, y: plane.originY },
      { x: tauX, y: plane.originY + plane.toLocal(0, 0).y },
    ],
    stroke: theme.palette.muted,
    strokeWidth: 1.5,
    dash: [5, 4],
    tracks: fade(T_STEP1 + 1),
  };
  scope.node.children.push(guide);

  const ctr: Node = {
    id: "ps-ctr-tau",
    type: "counter",
    x: eqX,
    y: LAYOUT.equation.y + 205,
    value: Number((tau1 * 1e6).toFixed(3)),
    decimals: 0,
    prefix: "τ = ",
    suffix: " µs",
    fontFamily: LABEL_FONT,
    fontSize: 22,
    fill: theme.palette.accent,
    align: "left",
    baseline: "middle",
    tracks: [
      stepTrack([
        { at: T_STEP1, value: Number((tau1 * 1e6).toFixed(3)) },
        { at: T_MOVE + 1.2, value: Number((tau2 * 1e6).toFixed(3)) },
      ]),
      ...fade(T_STEP1),
    ],
  };

  const step1Beat: Beat = {
    at: T_STEP1,
    dur: STEP_DUR,
    say: `Apply the step. The capacitor voltage rises along an exponential and reaches sixty-three percent of V after exactly one time constant, ${fmtTau(tau1)} here. The pole sits at minus one over tau on the real axis.`,
    nodes: [withTracks(scope.node, fade(T_STEP1 - 0.5)), withTracks(splane.node, fade(T_STEP1 - 0.5)), ctr],
  };
  const moveBeat: Beat = {
    at: T_MOVE,
    dur: 1.5,
    say: `Now divide the resistance by ${speedup}. Tau shrinks to ${fmtTau(tau2)}, and the pole slides left, further from the origin.`,
    nodes: [],
  };
  const step2Beat: Beat = {
    at: T_STEP2,
    dur: STEP_DUR,
    say: `Apply the same step again. The response is the same shape, but ${speedup} times faster: it reaches sixty-three percent in a third of the time. A pole further from the origin means a faster circuit.`,
    nodes: [],
  };
  const note: Node = {
    id: "ps-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 18,
    text: "The pole's distance from the origin IS the speed: 1/τ.  Left = faster.  This is the RC charging curve, seen from the s-plane.",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 16,
    fill: theme.palette.text,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w + 40,
    tracks: fade(T_NOTE),
  };
  const noteBeat: Beat = {
    at: T_NOTE,
    dur: 4,
    say: "So the pole location is not abstract. Its distance from the origin is one over tau: the speed of the circuit. Further left, faster. It is the RC charging curve you already know, seen from the s-plane.",
    nodes: [note],
  };

  return eeLesson({
    title: "Poles and the step response: one number, two views",
    beats: [circuit, equations, step1Beat, moveBeat, step2Beat, noteBeat],
    ...th,
  });
}
