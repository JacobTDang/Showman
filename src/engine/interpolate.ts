/**
 * Interpolation and track sampling.
 *
 * Sampling a track at time `t` is the heart of the animation system: find the
 * segment of keyframes that surrounds `t`, ease the local progress, and lerp the
 * two keyframe values. Outside the track's range we hold the nearest endpoint
 * (no extrapolation) — predictable and what authors expect.
 */

import type { Keyframe, Track } from "../spec/types.js";
import type { PropertyKind } from "../spec/schema.js";
import { applyEasing } from "./easing.js";
import { parseColor, rgbaToString, type Rgba } from "./color.js";

/** Linear interpolation between two numbers. */
export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** Linear interpolation between two colors in sRGB space. */
export function lerpColor(a: Rgba, b: Rgba, u: number): Rgba {
  return {
    r: Math.round(lerp(a.r, b.r, u)),
    g: Math.round(lerp(a.g, b.g, u)),
    b: Math.round(lerp(a.b, b.b, u)),
    a: lerp(a.a, b.a, u),
  };
}

/**
 * Find the active segment for time `t`: returns the index `i` such that
 * `keyframes[i].t <= t < keyframes[i+1].t`. Assumes keyframes are ascending and
 * non-empty, and that `t` is strictly inside `(first.t, last.t)`.
 */
function findSegment(keyframes: Keyframe[], t: number): number {
  // Linear scan is fine: keyframe counts are small. Binary search is a later
  // optimization if a track ever holds hundreds of keys.
  for (let i = keyframes.length - 1; i >= 0; i--) {
    if (t >= keyframes[i]!.t) return i;
  }
  return 0;
}

/**
 * Sample a numeric track at time `t` (seconds). Holds endpoints outside range.
 * Throws if the track is empty (the validator guarantees it is not).
 */
export function sampleNumberTrack(track: Track, t: number): number {
  const kf = track.keyframes;
  if (kf.length === 0) throw new Error(`track "${track.property}" has no keyframes`);
  const first = kf[0]!;
  const last = kf[kf.length - 1]!;
  if (t <= first.t) return first.value as number;
  if (t >= last.t) return last.value as number;

  const i = findSegment(kf, t);
  const k0 = kf[i]!;
  const k1 = kf[i + 1]!;
  const span = k1.t - k0.t;
  const localT = span <= 0 ? 0 : (t - k0.t) / span;
  const eased = applyEasing(k1.easing, localT);
  return lerp(k0.value as number, k1.value as number, eased);
}

/**
 * Sample a color track at time `t` (seconds), returning a canvas-ready string.
 * Holds endpoints outside range. Unparseable colors fall back to the raw string
 * (the validator should have caught them before render).
 */
export function sampleColorTrack(track: Track, t: number): string {
  const kf = track.keyframes;
  if (kf.length === 0) throw new Error(`track "${track.property}" has no keyframes`);
  const first = kf[0]!;
  const last = kf[kf.length - 1]!;
  if (t <= first.t) return first.value as string;
  if (t >= last.t) return last.value as string;

  const i = findSegment(kf, t);
  const k0 = kf[i]!;
  const k1 = kf[i + 1]!;
  const c0 = parseColor(k0.value as string);
  const c1 = parseColor(k1.value as string);
  if (!c0 || !c1) return (k1.value as string) ?? (k0.value as string);

  const span = k1.t - k0.t;
  const localT = span <= 0 ? 0 : (t - k0.t) / span;
  const eased = applyEasing(k1.easing, localT);
  return rgbaToString(lerpColor(c0, c1, eased));
}

/** Sample a track of the given kind at time `t`. Returns a number or a color string. */
export function sampleTrack(track: Track, t: number, kind: PropertyKind): number | string {
  return kind === "color" ? sampleColorTrack(track, t) : sampleNumberTrack(track, t);
}
