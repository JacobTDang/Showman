/**
 * Math motion presets — emit keyframe Tracks for the math-specific animations,
 * built on the same engine the general presets use (reuse `stagger`/`popIn`).
 *
 * - drawOn:      a polyline draws itself on (progress 0 → 1) — graphs, segments.
 * - shadeIn:     an arc fills (endAngle) — a fraction/pie filling.
 * - countUp:     a counter counts up (value) — scores, totals.
 * - hop:         a marker hops in a parabolic arc — number-line +/-.
 * - fillStagger: counters/cells pop in one by one — ten-frames, arrays.
 */

import type { Track } from "../spec/types.js";
import { popIn, stagger, type TimingOptions } from "../motion/presets.js";

function window(opts: TimingOptions, defaultDuration = 0.8): { t0: number; t1: number } {
  const t0 = opts.start ?? 0;
  return { t0, t1: t0 + (opts.duration ?? defaultDuration) };
}

/** Draw a polyline on (its `progress` 0 → 1). */
export function drawOn(opts: TimingOptions = {}): Track[] {
  const { t0, t1 } = window(opts);
  return [
    {
      property: "progress",
      keyframes: [
        { t: t0, value: 0 },
        { t: t1, value: 1, easing: opts.easing ?? "easeInOutQuad" },
      ],
    },
  ];
}

export interface ShadeInOptions extends TimingOptions {
  from?: number;
  to?: number;
}
/** Fill an arc (its `endAngle`) from `from` to `to` degrees — a fraction filling. */
export function shadeIn(opts: ShadeInOptions = {}): Track[] {
  const { t0, t1 } = window(opts);
  return [
    {
      property: "endAngle",
      keyframes: [
        { t: t0, value: opts.from ?? 0 },
        { t: t1, value: opts.to ?? 360, easing: opts.easing ?? "easeOutCubic" },
      ],
    },
  ];
}

export interface CountUpOptions extends TimingOptions {
  from?: number;
  to: number;
}
/** Count a counter's `value` up from `from` (default 0) to `to`. */
export function countUp(opts: CountUpOptions): Track[] {
  const { t0, t1 } = window(opts);
  return [
    {
      property: "value",
      keyframes: [
        { t: t0, value: opts.from ?? 0 },
        { t: t1, value: opts.to, easing: opts.easing ?? "easeOutCubic" },
      ],
    },
  ];
}

export interface HopOptions extends TimingOptions {
  fromX: number;
  toX: number;
  baseY: number;
  /** Peak hop height in px. Default 30. */
  height?: number;
}
/** A single parabolic hop: x moves `fromX`→`toX` while y dips up and back down. */
export function hop(opts: HopOptions): Track[] {
  const t0 = opts.start ?? 0;
  const dur = opts.duration ?? 0.5;
  const mid = t0 + dur / 2;
  const t1 = t0 + dur;
  const h = opts.height ?? 30;
  return [
    {
      property: "x",
      keyframes: [
        { t: t0, value: opts.fromX },
        { t: t1, value: opts.toX, easing: "easeInOutQuad" },
      ],
    },
    {
      property: "y",
      keyframes: [
        { t: t0, value: opts.baseY },
        { t: mid, value: opts.baseY - h, easing: "easeOutQuad" },
        { t: t1, value: opts.baseY, easing: "easeInQuad" },
      ],
    },
  ];
}

/** Pop in `count` items one after another (ten-frame cells, array dots). */
export function fillStagger(count: number, opts: { start?: number; step?: number; duration?: number } = {}): Track[][] {
  return stagger(count, (start) => popIn({ start, duration: opts.duration ?? 0.4 }), { start: opts.start ?? 0, step: opts.step ?? 0.12 });
}
