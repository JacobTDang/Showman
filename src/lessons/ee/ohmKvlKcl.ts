/**
 * ee.ohmKvlKcl — the three laws everything else is built from, with the numbers live.
 *
 * Ohm: V = IR, read off each resistor as the current flows. KVL: walk the loop and the
 * drops add up to the source, to the volt. KCL: a second branch appears at the junction
 * and the current arriving there is exactly what leaves down the two branches. DC is
 * flat lines on the scope — worth seeing once, so a sinusoid later reads as the change.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, type Beat } from "./kit.js";
import { seriesParallelLoop } from "./schematics.js";
import { fade, fmtR, stepTrack, withTracks } from "./util.js";

export interface OhmKvlKclOptions {
  V?: number;
  R1?: number;
  R2?: number;
  R3?: number;
  theme?: string;
}

const T_CIRCUIT = 0.5;
const T_OHM = 4;
const T_KVL = 8.5;
const T_KCL = 13;
const T_NOTE = 18.5;
const T_AXIS = 4;

export function buildOhmKvlKcl(o: OhmKvlKclOptions = {}): SceneSpec {
  const V = o.V ?? 12;
  const R1 = o.R1 ?? 1000;
  const R2 = o.R2 ?? 2000;
  const R3 = o.R3 ?? 2000;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  // Before the branch: a series loop. After: R2 ∥ R3 across the junction.
  const I0 = V / (R1 + R2);
  const Rp = (R2 * R3) / (R2 + R3);
  const I1 = V / (R1 + Rp);
  const Vj = I1 * Rp;
  const I2 = Vj / R2;
  const I3 = Vj / R3;
  const mA = (a: number) => Number((a * 1e3).toFixed(3));

  const sch = seriesParallelLoop({
    id: "ok-sch",
    x: LAYOUT.schematic.x + 90,
    y: LAYOUT.schematic.y + 20,
    r1Label: `R1 = ${fmtR(R1)}`,
    r2Label: `R2 = ${fmtR(R2)}`,
    r3Label: `R3 = ${fmtR(R3)}`,
    branchAt: T_KCL,
    current: true,
    ...th,
  });
  const srcLbl: Node = {
    id: "ok-v",
    type: "text",
    x: LAYOUT.schematic.x + 60,
    y: LAYOUT.schematic.y + 130,
    text: `${V} V`,
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 16,
    fill: theme.palette.text,
    align: "right",
    baseline: "middle",
  };

  const eqX = LAYOUT.equation.x;
  const eqOhm = equationPane({ id: "ok-eq-ohm", latex: "V=IR", x: eqX, y: LAYOUT.equation.y + 10, at: T_OHM, size: 28, ...th });
  const eqKvl = equationPane({
    id: "ok-eq-kvl",
    latex: `V_{R1}+V_{R2}=${V}\\,\\mathrm{V}\\quad\\text{(KVL: the drops around a loop sum to the source)}`,
    x: eqX,
    y: LAYOUT.equation.y + 70,
    at: T_KVL,
    size: 18,
    color: theme.palette.accent,
    ...th,
  });
  const eqKcl = equationPane({
    id: "ok-eq-kcl",
    latex: "I_1=I_2+I_3\\quad\\text{(KCL: what enters a node leaves it)}",
    x: eqX,
    y: LAYOUT.equation.y + 125,
    at: T_KCL,
    size: 18,
    color: theme.palette.secondary,
    ...th,
  });

  const ctr = (
    id: string,
    x: number,
    y: number,
    prefix: string,
    suffix: string,
    fill: string,
    steps: Array<{ at: number; value: number }>,
    at: number,
    decimals = 1,
  ): Node => ({
    id,
    type: "counter",
    x,
    y,
    value: steps[0]!.value,
    decimals,
    prefix,
    suffix,
    fontFamily: LABEL_FONT,
    fontSize: 20,
    fill,
    align: "left",
    baseline: "middle",
    tracks: [stepTrack(steps), ...fade(at)],
  });
  const cx = LAYOUT.transfer.x + 70;
  const cy = LAYOUT.transfer.y + 40;
  const counters: Node[] = [
    {
      id: "ok-ctr-t",
      type: "text",
      x: cx,
      y: cy - 20,
      text: "read off the circuit, live",
      fontFamily: LABEL_FONT,
      fontWeight: 700,
      fontSize: 14,
      fill: theme.palette.muted,
      align: "left",
      baseline: "middle",
      tracks: fade(T_OHM),
    },
    ctr(
      "ok-ctr-i",
      cx,
      cy + 20,
      "I = ",
      " mA",
      theme.palette.primary,
      [
        { at: T_OHM, value: mA(I0) },
        { at: T_KCL, value: mA(I1) },
      ],
      T_OHM,
    ),
    ctr(
      "ok-ctr-v1",
      cx,
      cy + 60,
      "V across R1 = ",
      " V",
      theme.palette.text,
      [
        { at: T_OHM, value: Number((I0 * R1).toFixed(3)) },
        { at: T_KCL, value: Number((I1 * R1).toFixed(3)) },
      ],
      T_OHM,
    ),
    ctr(
      "ok-ctr-v2",
      cx,
      cy + 100,
      "V across R2 = ",
      " V",
      theme.palette.text,
      [
        { at: T_OHM, value: Number((I0 * R2).toFixed(3)) },
        { at: T_KCL, value: Number(Vj.toFixed(3)) },
      ],
      T_OHM,
    ),
    ctr("ok-ctr-i2", cx + 260, cy + 60, "I₂ = ", " mA", theme.palette.secondary, [{ at: T_KCL, value: mA(I2) }], T_KCL),
    ctr("ok-ctr-i3", cx + 260, cy + 100, "I₃ = ", " mA", theme.palette.secondary, [{ at: T_KCL, value: mA(I3) }], T_KCL),
  ];

  const yMax = Math.ceil(mA(I1) * 1.25);
  const scope = scopePaneRaw({
    id: "ok-scope",
    x: LAYOUT.scope.x + 60,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 80,
    height: LAYOUT.scope.h - 26,
    tMax: T_AXIS,
    xLabel: "time — DC does not change",
    planes: [
      {
        label: "current (mA)",
        yMin: 0,
        yMax,
        yTicks: [0, Math.round(yMax / 2), yMax],
        traces: [
          { id: "i0", fn: () => mA(I0), color: theme.palette.primary, start: T_OHM, duration: 2.5, strokeWidth: 2.5 },
          { id: "i1", fn: () => mA(I1), color: theme.palette.primary, start: T_KCL, duration: 2.5, strokeWidth: 2.5 },
          { id: "i2", fn: () => mA(I2), color: theme.palette.secondary, start: T_KCL + 0.5, duration: 2.5, dash: [6, 4], strokeWidth: 2 },
          { id: "i3", fn: () => mA(I3), color: theme.palette.secondary, start: T_KCL + 0.5, duration: 2.5, dash: [3, 4], strokeWidth: 2 },
        ],
      },
    ],
    ...th,
  });

  const beats: Beat[] = [
    {
      at: T_CIRCUIT,
      dur: 3,
      say: `A ${V} volt battery, ${fmtR(R1)} in series with ${fmtR(R2)}. One loop, one current, flowing round it.`,
      nodes: [withTracks(sch.node, fade(T_CIRCUIT)), withTracks(srcLbl, fade(T_CIRCUIT))],
    },
    {
      at: T_OHM,
      dur: 4,
      say: `Ohm's law. The whole loop has ${fmtR(R1 + R2)}, so the current is ${mA(I0)} milliamps. Read it off each resistor: ${mA(I0)} milliamps through ${fmtR(R1)} drops ${(I0 * R1).toFixed(0)} volts, and through ${fmtR(R2)} drops ${(I0 * R2).toFixed(0)}. DC is a flat line: it does not change.`,
      nodes: [eqOhm.node, ...counters, withTracks(scope.node, fade(T_OHM))],
    },
    {
      at: T_KVL,
      dur: 4,
      say: `Kirchhoff's voltage law. Walk the loop: ${(I0 * R1).toFixed(0)} plus ${(I0 * R2).toFixed(0)} is ${V}, the battery exactly. The drops around any closed loop add up to the source. Always.`,
      nodes: [eqKvl.node],
    },
    {
      at: T_KCL,
      dur: 5,
      say: `Now a third resistor across the second. The current has two ways down from the junction. Kirchhoff's current law: what arrives at the node leaves it. ${mA(I1)} milliamps in, ${mA(I2)} plus ${mA(I3)} out. The total went up, because two paths is less resistance than one.`,
      nodes: [eqKcl.node],
    },
    {
      at: T_NOTE,
      dur: 4,
      say: "Three laws. Ohm ties voltage to current through a resistance. KVL says loops close. KCL says nodes conserve. Every circuit in this course, however strange it looks, is those three applied until the unknowns run out.",
      nodes: [
        {
          id: "ok-note",
          type: "text",
          x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
          y: LAYOUT.transfer.y + LAYOUT.transfer.h + 18,
          text: "Ohm ties V to I.  KVL: loops close.  KCL: nodes conserve.  Every circuit is these three, applied until the unknowns run out.",
          fontFamily: LABEL_FONT,
          fontWeight: 600,
          fontSize: 15,
          fill: theme.palette.text,
          align: "center",
          baseline: "middle",
          maxWidth: LAYOUT.transfer.w + 40,
          tracks: fade(T_NOTE),
        },
      ],
    },
  ];
  return eeLesson({ title: "Ohm, KVL, KCL: the three laws, read live off the circuit", beats, ...th });
}
