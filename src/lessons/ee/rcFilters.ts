/**
 * ee.rcFilters — lowpass and highpass side by side, one sweep.
 *
 * Same R, same C, and the only difference is which element sits in series. Swept together
 * through the corner, the lowpass output fades as the highpass output grows, and both
 * dots meet at −3 dB exactly at ω0: the crossover. Below it the lowpass wins; above it
 * the highpass. That is what "pass band" and "stop band" mean.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import {
  LABEL_FONT,
  LAYOUT,
  bodePaneMulti,
  eeLesson,
  equationPane,
  logSweep,
  rcHighpass,
  rcLowpass,
  scopePaneRaw,
  type Beat,
} from "./kit.js";
import { rcSchematic } from "./schematics.js";
import { chirp, fade, fmtC, fmtOmega, fmtR, valueTrack, withTracks } from "./util.js";

export interface RcFiltersOptions {
  R?: number;
  C?: number;
  theme?: string;
}

const T_CIRCUITS = 0.5;
const T_EQ = 4.5;
const T_SWEEP = 9;
const SWEEP_DUR = 10;
const T_NOTE = T_SWEEP + SWEEP_DUR + 1;

export function buildRcFilters(o: RcFiltersOptions = {}): SceneSpec {
  const R = o.R ?? 1000;
  const C = o.C ?? 100e-9;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const lp = rcLowpass(R, C);
  const hp = rcHighpass(R, C);
  const sweep = logSweep({ omega0: lp.omega0, fromDecade: -1, toDecade: 1, duration: SWEEP_DUR });
  const { input, outputFor } = chirp(sweep);

  // Two schematics side by side, scaled to share the slot.
  const scale = 0.62;
  const lpSch = rcSchematic({
    id: "rf-lp",
    x: 0,
    y: 0,
    series: "R",
    rLabel: `R = ${fmtR(R)}`,
    cLabel: `C = ${fmtC(C)}`,
    current: true,
    ...th,
  });
  const hpSch = rcSchematic({
    id: "rf-hp",
    x: 0,
    y: 0,
    series: "C",
    rLabel: `R = ${fmtR(R)}`,
    cLabel: `C = ${fmtC(C)}`,
    current: true,
    ...th,
  });
  const caption = (id: string, x: number, text: string, fill: string): Node => ({
    id,
    type: "text",
    x,
    y: LAYOUT.schematic.y + 165,
    text,
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 16,
    fill,
    align: "center",
    baseline: "middle",
  });
  const circuits: Beat = {
    at: T_CIRCUITS,
    dur: 3.5,
    say: "Two RC networks with the same resistor and the same capacitor. On the left the resistor is in series and the output is across the capacitor. On the right they swap. That single swap is the whole difference.",
    nodes: [
      withTracks(
        { id: "rf-lp-g", type: "group", x: LAYOUT.schematic.x + 30, y: LAYOUT.schematic.y + 10, scale, children: [lpSch.node] },
        fade(T_CIRCUITS),
      ),
      withTracks(
        { id: "rf-hp-g", type: "group", x: LAYOUT.schematic.x + 300, y: LAYOUT.schematic.y + 10, scale, children: [hpSch.node] },
        fade(T_CIRCUITS),
      ),
      withTracks(caption("rf-lp-cap", LAYOUT.schematic.x + 130, "lowpass", theme.palette.accent), fade(T_CIRCUITS)),
      withTracks(caption("rf-hp-cap", LAYOUT.schematic.x + 400, "highpass", theme.palette.secondary), fade(T_CIRCUITS)),
    ],
  };

  const eqX = LAYOUT.equation.x;
  const eqLp = equationPane({
    id: "rf-eq-lp",
    latex: `T_{LP}(s)=${lp.latex.replace("T(s)=", "")}`,
    x: eqX,
    y: LAYOUT.equation.y + 10,
    at: T_EQ,
    size: 24,
    color: theme.palette.accent,
    ...th,
  });
  const eqHp = equationPane({
    id: "rf-eq-hp",
    latex: `T_{HP}(s)=${hp.latex.replace("T(s)=", "")}`,
    x: eqX + 270,
    y: LAYOUT.equation.y + 10,
    at: T_EQ + 1,
    size: 24,
    color: theme.palette.secondary,
    ...th,
  });
  const eqCorner = equationPane({
    id: "rf-eq-w0",
    latex: "\\omega_0=\\frac{1}{RC}\\qquad |T_{LP}(j\\omega_0)|=|T_{HP}(j\\omega_0)|=\\frac{1}{\\sqrt{2}}",
    x: eqX,
    y: LAYOUT.equation.y + 85,
    at: T_EQ + 2,
    size: 21,
    ...th,
  });
  const equations: Beat = {
    at: T_EQ,
    dur: 4,
    say: "The lowpass is one over one plus s R C. The highpass is s R C over the same denominator. They share a corner frequency, one over R C, and at that frequency both have a gain of one over root two.",
    nodes: [eqLp.node, eqHp.node, eqCorner.node],
  };

  const scope = scopePaneRaw({
    id: "rf-scope",
    x: LAYOUT.scope.x + 60,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 80,
    height: LAYOUT.scope.h - 26,
    tMax: SWEEP_DUR,
    samples: 1200,
    xLabel: "time",
    planes: [
      {
        label: "v_in",
        yMin: -1.15,
        yMax: 1.15,
        yTicks: [-1, 0, 1],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "in", fn: input, color: theme.palette.primary, start: T_SWEEP, duration: SWEEP_DUR, marker: true }],
      },
      {
        label: "lowpass out",
        yMin: -1.15,
        yMax: 1.15,
        yTicks: [-1, 0, 1],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "lp", fn: outputFor(lp), color: theme.palette.accent, start: T_SWEEP, duration: SWEEP_DUR, marker: true }],
      },
      {
        label: "highpass out",
        yMin: -1.15,
        yMax: 1.15,
        yTicks: [-1, 0, 1],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "hp", fn: outputFor(hp), color: theme.palette.secondary, start: T_SWEEP, duration: SWEEP_DUR, marker: true }],
      },
    ],
    ...th,
  });
  const bode = bodePaneMulti({
    id: "rf-bode",
    x: LAYOUT.transfer.x + 60,
    y: LAYOUT.transfer.y + 10,
    width: LAYOUT.transfer.w - 80,
    height: LAYOUT.transfer.h - 40,
    transfers: [
      { transfer: lp, label: "lowpass", color: theme.palette.accent },
      { transfer: hp, label: "highpass", color: theme.palette.secondary },
    ],
    sweep,
    start: T_SWEEP,
    duration: SWEEP_DUR,
    ...th,
  });
  const ctrY = LAYOUT.equation.y + 170;
  const counter = (id: string, x: number, prefix: string, fill: string, fn: (u: number) => number): Node => ({
    id,
    type: "counter",
    x,
    y: ctrY,
    value: Number(fn(0).toFixed(3)),
    decimals: 1,
    prefix,
    suffix: " dB",
    fontFamily: LABEL_FONT,
    fontSize: 21,
    fill,
    align: "left",
    baseline: "middle",
    tracks: [valueTrack(fn, T_SWEEP, SWEEP_DUR), ...fade(T_SWEEP)],
  });
  const sweepBeat: Beat = {
    at: T_SWEEP,
    dur: SWEEP_DUR,
    say: "Now sweep the frequency up through the corner. Watch the lowpass output fade as the highpass output grows. On the Bode plot the two dots slide toward each other, and they cross at the corner.",
    nodes: [
      withTracks(scope.node, fade(T_SWEEP - 0.5)),
      withTracks(bode.node, fade(T_SWEEP - 0.5)),
      counter("rf-ctr-lp", eqX, "|T_LP| = ", theme.palette.accent, (u) => lp.dB(sweep.omega(u))),
      counter("rf-ctr-hp", eqX + 240, "|T_HP| = ", theme.palette.secondary, (u) => hp.dB(sweep.omega(u))),
    ],
  };

  const note: Node = {
    id: "rf-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 18,
    text: `Crossover at ω₀ = ${fmtOmega(lp.omega0)}: both −3 dB.  Below it the lowpass passes; above it the highpass does.`,
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
    say: "At the corner both filters are exactly minus three decibels. Below it, the lowpass is the one that passes. Above it, the highpass is. Pass band and stop band are the same frequency axis seen from two sides.",
    nodes: [note],
  };

  return eeLesson({
    title: "RC filters: lowpass and highpass are one swap apart",
    beats: [circuits, equations, sweepBeat, noteBeat],
    ...th,
  });
}
