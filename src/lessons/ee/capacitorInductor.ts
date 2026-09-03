/**
 * ee.capacitorInductor — why current leads in a capacitor and lags in an inductor.
 *
 * i = C dv/dt: the capacitor's current is the SLOPE of its voltage, so it peaks where the
 * voltage is steepest — a quarter cycle early. v = L di/dt is the same relation the
 * other way round, so in an inductor the current arrives a quarter cycle late. Both are
 * drawn on one time axis, so the lead and the lag are visible offsets, not a rule.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, type Beat } from "./kit.js";
import { singleElementLoop } from "./schematics.js";
import { fade, fadeBetween, fmtC, fmtL, withTracks } from "./util.js";

export interface CapacitorInductorOptions {
  C?: number;
  L?: number;
  theme?: string;
}

const T_C = 0.5;
const T_EQ_C = 4.5;
const T_L = 9;
const T_EQ_L = 13;
const DRAW = 3.5;
const T_NOTE = T_EQ_L + 4;
const T_AXIS = 2;

export function buildCapacitorInductor(o: CapacitorInductorOptions = {}): SceneSpec {
  const C = o.C ?? 100e-9;
  const L = o.L ?? 10e-3;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const TWO_PI = 2 * Math.PI;
  const v = (t: number) => Math.sin(TWO_PI * t);
  // Normalised: i_C ∝ dv/dt = cos, a quarter cycle EARLY; i_L ∝ ∫v = −cos, a quarter cycle LATE.
  const iC = (t: number) => Math.cos(TWO_PI * t);
  const iL = (t: number) => -Math.cos(TWO_PI * t);

  const capLoop = singleElementLoop({
    id: "ci-cap",
    x: LAYOUT.schematic.x + 130,
    y: LAYOUT.schematic.y + 20,
    element: "capacitor",
    label: `C = ${fmtC(C)}`,
    current: true,
    ...th,
  });
  const indLoop = singleElementLoop({
    id: "ci-ind",
    x: LAYOUT.schematic.x + 130,
    y: LAYOUT.schematic.y + 20,
    element: "inductor",
    label: `L = ${fmtL(L)}`,
    current: true,
    ...th,
  });

  const scope = scopePaneRaw({
    id: "ci-scope",
    x: LAYOUT.scope.x + 60,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 80,
    height: LAYOUT.scope.h - 26,
    tMax: T_AXIS,
    xLabel: "time",
    planes: [
      {
        label: "v(t)",
        yMin: -1.15,
        yMax: 1.15,
        yTicks: [-1, 0, 1],
        traces: [{ id: "v", fn: v, color: theme.palette.primary, start: T_C, duration: DRAW, marker: true, strokeWidth: 2.5 }],
      },
      {
        label: "i(t), normalised",
        yMin: -1.15,
        yMax: 1.15,
        yTicks: [-1, 0, 1],
        traces: [
          { id: "ic", fn: iC, color: theme.palette.accent, start: T_C, duration: DRAW, marker: true, strokeWidth: 2.5 },
          { id: "il", fn: iL, color: theme.palette.secondary, start: T_L, duration: DRAW, marker: true, strokeWidth: 2.5 },
        ],
      },
    ],
    ...th,
  });

  const eqX = LAYOUT.equation.x;
  const eqC = equationPane({
    id: "ci-eq-c",
    latex: "i_C=C\\,\\frac{dv}{dt}\\quad\\Rightarrow\\quad i\\text{ peaks where }v\\text{ is steepest}",
    x: eqX,
    y: LAYOUT.equation.y + 10,
    at: T_EQ_C,
    size: 21,
    color: theme.palette.accent,
    ...th,
  });
  const eqL = equationPane({
    id: "ci-eq-l",
    latex: "v_L=L\\,\\frac{di}{dt}\\quad\\Rightarrow\\quad v\\text{ peaks where }i\\text{ is steepest}",
    x: eqX,
    y: LAYOUT.equation.y + 80,
    at: T_EQ_L,
    size: 21,
    color: theme.palette.secondary,
    ...th,
  });
  const callout = (id: string, y: number, text: string, fill: string, at: number): Node => ({
    id,
    type: "text",
    x: LAYOUT.transfer.x + 80,
    y,
    text,
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 22,
    fill,
    align: "left",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w - 120,
    tracks: fade(at),
  });

  const beats: Beat[] = [
    {
      at: T_C,
      dur: DRAW,
      say: "A capacitor across a sinusoidal source. Watch the current: it is at its peak exactly when the voltage is crossing zero — because that is where the voltage is changing fastest. Current is the slope of voltage.",
      nodes: [withTracks(capLoop.node, fadeBetween(T_C, T_L - 0.6)), withTracks(scope.node, fade(T_C))],
    },
    {
      at: T_EQ_C,
      dur: 3.5,
      say: "That is the whole capacitor law: i equals C d v d t. The current is a quarter cycle ahead. Engineers say the current leads the voltage by ninety degrees.",
      nodes: [eqC.node, callout("ci-call-c", LAYOUT.transfer.y + 70, "capacitor:  i leads v by 90°", theme.palette.accent, T_EQ_C)],
    },
    {
      at: T_L,
      dur: DRAW,
      say: "Swap in an inductor. Same source, same voltage. Now the current peaks a quarter cycle after the voltage does. The relation is the same one turned around: voltage is the slope of current.",
      nodes: [withTracks(indLoop.node, fade(T_L))],
    },
    {
      at: T_EQ_L,
      dur: 3.5,
      say: "v equals L d i d t. The current lags the voltage by ninety degrees. Same quarter turn, opposite direction — and that opposite sign is why capacitors and inductors can cancel each other.",
      nodes: [eqL.node, callout("ci-call-l", LAYOUT.transfer.y + 130, "inductor:  i lags v by 90°", theme.palette.secondary, T_EQ_L)],
    },
    {
      at: T_NOTE,
      dur: 4,
      say: "A resistor has no quarter turn at all: its current and voltage rise and fall together. So the three elements are zero, plus ninety, and minus ninety degrees. That is impedance, and the phasor lesson shows where the ninety comes from.",
      nodes: [
        callout("ci-call-r", LAYOUT.transfer.y + 190, "resistor:  i and v in step, 0°", theme.palette.text, T_NOTE),
        {
          id: "ci-note",
          type: "text",
          x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
          y: LAYOUT.transfer.y + LAYOUT.transfer.h + 18,
          text: "ELI the ICE man:  in an inductor (L) voltage E leads current I;  in a capacitor (C) current I leads voltage E.",
          fontFamily: LABEL_FONT,
          fontWeight: 600,
          fontSize: 15,
          fill: theme.palette.muted,
          align: "center",
          baseline: "middle",
          maxWidth: LAYOUT.transfer.w + 40,
          tracks: fade(T_NOTE),
        },
      ],
    },
  ];
  return eeLesson({ title: "Capacitors and inductors: current is a slope, and that is a quarter turn", beats, ...th });
}
