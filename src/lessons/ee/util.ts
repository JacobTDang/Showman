/** Small helpers every EE lesson reaches for: timing tracks, unit formatting, the chirp. */
import type { Node, Track } from "../../spec/types.js";
import type { Sweep, Transfer } from "./kit.js";

/** Sample a function into a `value` track, so a counter can read a swept quantity live. */
export function valueTrack(fn: (u: number) => number, start: number, duration: number, steps = 40): Track {
  const keyframes = [];
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * duration;
    keyframes.push({ t: Number((start + u).toFixed(3)), value: Number(fn(u).toFixed(3)) });
  }
  return { property: "value", keyframes };
}

/** A counter that jumps between values at given moments, holding each until the next. */
export function stepTrack(steps: Array<{ at: number; value: number }>): Track {
  const keyframes: Array<{ t: number; value: number }> = [];
  steps.forEach((s, i) => {
    if (i > 0) keyframes.push({ t: Number((s.at - 0.001).toFixed(3)), value: steps[i - 1]!.value });
    keyframes.push({ t: s.at, value: s.value });
  });
  return { property: "value", keyframes };
}

export function fade(at: number, dur = 0.5): Track[] {
  return [
    {
      property: "opacity",
      keyframes: [
        { t: at, value: 0 },
        { t: at + dur, value: 1 },
      ],
    },
  ];
}

/** Fade in at `at`, then out again at `until`, for a callout that should not linger. */
export function fadeBetween(at: number, until: number, dur = 0.4): Track[] {
  return [
    {
      property: "opacity",
      keyframes: [
        { t: at, value: 0 },
        { t: at + dur, value: 1 },
        { t: until, value: 1 },
        { t: until + dur, value: 0 },
      ],
    },
  ];
}

export function withTracks(node: Node, tracks: Track[]): Node {
  return { ...node, tracks: [...((node as { tracks?: Track[] }).tracks ?? []), ...tracks] };
}

export function fmtR(R: number): string {
  return R >= 1e6 ? `${R / 1e6} MΩ` : R >= 1e3 ? `${R / 1e3} kΩ` : `${R} Ω`;
}
export function fmtC(C: number): string {
  return C >= 1e-6
    ? `${(C * 1e6).toFixed(C * 1e6 < 10 ? 1 : 0)} µF`
    : C >= 1e-9
      ? `${(C * 1e9).toFixed(0)} nF`
      : `${(C * 1e12).toFixed(0)} pF`;
}
export function fmtL(L: number): string {
  return L >= 1 ? `${L} H` : L >= 1e-3 ? `${(L * 1e3).toFixed(0)} mH` : `${(L * 1e6).toFixed(0)} µH`;
}
export function fmtOmega(w: number): string {
  return w >= 1e6 ? `${(w / 1e6).toFixed(2)} Mrad/s` : w >= 1e3 ? `${(w / 1e3).toFixed(1)} krad/s` : `${w.toFixed(0)} rad/s`;
}
export function fmtTau(tau: number): string {
  return tau >= 1
    ? `${tau.toFixed(2)} s`
    : tau >= 1e-3
      ? `${(tau * 1e3).toFixed(1)} ms`
      : tau >= 1e-6
        ? `${(tau * 1e6).toFixed(0)} µs`
        : `${(tau * 1e9).toFixed(0)} ns`;
}

/**
 * The chirp a swept scope draws. The real ω is far too fast to draw, so the timebase is
 * scaled by a constant k so `startCycles` fit the window at the sweep's start; gain and
 * phase shift are still evaluated at the REAL ω. Shared by every lesson that sweeps.
 */
export function chirp(sweep: Sweep, startCycles = 2) {
  const D = sweep.duration;
  const k = (2 * Math.PI * startCycles) / D / sweep.omega(0);
  const inputPhase = (t: number) => k * sweep.phase(t);
  const input = (t: number) => Math.sin(inputPhase(t));
  const outputFor =
    (T: Transfer, amplitude = 1) =>
    (t: number) => {
      const w = sweep.omega(t);
      return amplitude * T.mag(w) * Math.sin(inputPhase(t) + T.phaseRad(w));
    };
  return { k, inputPhase, input, outputFor };
}
