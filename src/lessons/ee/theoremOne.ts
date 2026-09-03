/**
 * ee.theoremOne — the flagship lesson. Geiger's Theorem 1 made visible:
 *
 *   If a linear network has transfer function T(s) and input X_M sin(ωt + θ), the steady
 *   state output is X_M |T(jω)| sin(ωt + θ + ∠T(jω)).
 *
 * An RC lowpass, a sinusoid in, and the frequency swept through the corner. The scope
 * shows the output at the same frequency shrinking and sliding right; the Bode plot's
 * dot rides down the curve at the same instant; the counters read |T| and ∠T live. At
 * ω0 = 1/RC the lesson stops to name what it just showed: −3 dB, −45°, the corner.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, bodePane, eeLesson, equationPane, logSweep, rcLowpass, scopePane, type Beat } from "./kit.js";
import { rcSchematic } from "./schematics.js";
import { fade, fmtC, fmtOmega, fmtR, valueTrack, withTracks } from "./util.js";

export interface TheoremOneOptions {
  /** Resistance, ohms. Default 1 kΩ. */
  R?: number;
  /** Capacitance, farads. Default 100 nF. */
  C?: number;
  theme?: string;
}

/** Lesson clock, seconds. */
const T_CIRCUIT = 0.5;
const T_TRANSFER = 4;
const T_THEOREM = 8;
const T_SWEEP = 12;
const SWEEP_DUR = 10;
const T_CORNER = T_SWEEP + SWEEP_DUR + 1;

export function buildTheoremOne(o: TheoremOneOptions = {}): SceneSpec {
  const R = o.R ?? 1000;
  const C = o.C ?? 100e-9;
  const theme = getTheme(o.theme);
  const T = rcLowpass(R, C);
  const sweep = logSweep({ omega0: T.omega0, fromDecade: -1, toDecade: 1, duration: SWEEP_DUR });
  const th = o.theme ? { theme: o.theme } : {};

  // Beat 1 — the circuit, with current shown flowing.
  const sch = rcSchematic({
    id: "t1-sch",
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
    say: "Here is an RC lowpass: a resistor in series, then a capacitor to the return rail. The output is the voltage across the capacitor.",
    nodes: [withTracks(sch.node, fade(T_CIRCUIT))],
  };

  // Beat 2 — the transfer function.
  const eqX = LAYOUT.equation.x;
  const eq1 = equationPane({ id: "t1-eq-T", latex: T.latex, x: eqX, y: LAYOUT.equation.y + 10, at: T_TRANSFER, size: 26, ...th });
  const eq2 = equationPane({
    id: "t1-eq-mag",
    latex: "|T(j\\omega)|=\\frac{1}{\\sqrt{1+(\\omega RC)^2}}\\qquad \\angle T(j\\omega)=-\\tan^{-1}(\\omega RC)",
    x: eqX,
    y: LAYOUT.equation.y + 80,
    at: T_TRANSFER + 1.5,
    size: 21,
    ...th,
  });
  const transfer: Beat = {
    at: T_TRANSFER,
    dur: 3.5,
    say: "Its transfer function is one over one plus s R C. At s equals j omega, the magnitude falls as omega R C grows, and the phase lags by the arctangent of omega R C.",
    nodes: [eq1.node, eq2.node],
  };

  // Beat 3 — the theorem itself.
  const eq3 = equationPane({
    id: "t1-eq-thm",
    latex: "v_{out}(t)=V_M\\,|T(j\\omega)|\\,\\sin\\!\\big(\\omega t+\\angle T(j\\omega)\\big)",
    x: eqX,
    y: LAYOUT.equation.y + 145,
    at: T_THEOREM,
    size: 22,
    color: theme.palette.accent,
    ...th,
  });
  const theorem: Beat = {
    at: T_THEOREM,
    dur: 3.5,
    say: "Theorem one. Feed in a sinusoid, and out comes a sinusoid at the same frequency, scaled by the magnitude of T and shifted by its phase. Nothing else changes.",
    nodes: [eq3.node],
  };

  // Beat 4 — the sweep. Scope and Bode share the same clock.
  const scope = scopePane({
    id: "t1-scope",
    x: LAYOUT.scope.x + 60,
    y: LAYOUT.scope.y + 10,
    width: LAYOUT.scope.w - 80,
    height: LAYOUT.scope.h - 30,
    sweep,
    transfer: T,
    amplitude: 1,
    start: T_SWEEP,
    duration: SWEEP_DUR,
    ...th,
  });
  const bode = bodePane({
    id: "t1-bode",
    x: LAYOUT.transfer.x + 60,
    y: LAYOUT.transfer.y + 10,
    width: LAYOUT.transfer.w - 80,
    height: LAYOUT.transfer.h - 40,
    transfer: T,
    sweep,
    start: T_SWEEP,
    duration: SWEEP_DUR,
    ...th,
  });
  const counterY = LAYOUT.equation.y + 215;
  const counters: Node[] = [
    {
      id: "t1-ctr-mag",
      type: "counter",
      x: eqX,
      y: counterY,
      value: Number(T.dB(sweep.omega(0)).toFixed(3)),
      decimals: 1,
      prefix: "|T| = ",
      suffix: " dB",
      fontFamily: LABEL_FONT,
      fontSize: 22,
      fill: theme.palette.primary,
      align: "left",
      baseline: "middle",
      tracks: [valueTrack((u) => T.dB(sweep.omega(u)), T_SWEEP, SWEEP_DUR), ...fade(T_SWEEP)],
    },
    {
      id: "t1-ctr-ph",
      type: "counter",
      x: eqX + 220,
      y: counterY,
      value: Number(T.phaseDeg(sweep.omega(0)).toFixed(3)),
      decimals: 0,
      prefix: "arg T = ",
      suffix: "°",
      fontFamily: LABEL_FONT,
      fontSize: 22,
      fill: theme.palette.accent,
      align: "left",
      baseline: "middle",
      tracks: [valueTrack((u) => T.phaseDeg(sweep.omega(u)), T_SWEEP, SWEEP_DUR), ...fade(T_SWEEP)],
    },
    {
      id: "t1-ctr-w",
      type: "counter",
      x: eqX + 400,
      y: counterY,
      value: Number(sweep.omega(0).toFixed(3)),
      decimals: 0,
      prefix: "ω = ",
      suffix: " rad/s",
      fontFamily: LABEL_FONT,
      fontSize: 18,
      fill: theme.palette.muted,
      align: "left",
      baseline: "middle",
      tracks: [valueTrack((u) => sweep.omega(u), T_SWEEP, SWEEP_DUR), ...fade(T_SWEEP)],
    },
  ];
  const sweepBeat: Beat = {
    at: T_SWEEP,
    dur: SWEEP_DUR,
    say: "Now watch. The frequency sweeps up two decades through the corner. The output stays a sinusoid, but it shrinks and slides right — and the dot rides down the Bode plot at the very same moment. Same event, two views.",
    nodes: [withTracks(scope.node, fade(T_SWEEP - 0.5)), withTracks(bode.node, fade(T_SWEEP - 0.5)), ...counters],
  };

  // Beat 5 — name the corner.
  const cornerNote: Node = {
    id: "t1-corner",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 18,
    text: `ω₀ = 1/RC = ${fmtOmega(T.omega0)}:  −3 dB and −45°.  Above it: the stop band.`,
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 17,
    fill: theme.palette.accent,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w + 40,
    tracks: fade(T_CORNER),
  };
  const corner: Beat = {
    at: T_CORNER,
    dur: 4,
    say: `At omega naught, one over R C, the gain is exactly minus three decibels and the phase exactly minus forty-five degrees. That is the corner. Everything above it is the stop band, and the output there is what you saw: small and lagging.`,
    nodes: [cornerNote],
  };

  return eeLesson({
    title: "Theorem 1: a sinusoid in, a scaled and shifted sinusoid out",
    beats: [circuit, transfer, theorem, sweepBeat, corner],
    ...th,
  });
}
