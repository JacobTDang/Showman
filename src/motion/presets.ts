/**
 * M5.2 — Motion design system.
 *
 * Curated animation presets that emit keyframe Tracks, so agent-authored motion
 * looks *animated* — anticipation, overshoot, follow-through — instead of robotic
 * linear tweens. Presets compose: attach several to one node, or `stagger` them
 * across a row of items for a polished cascade.
 *
 * Times are in seconds (the engine's time model).
 */

import type { Track, EasingSpec } from "../spec/types.js";

export interface TimingOptions {
  /** When the motion starts, in seconds. Default 0. */
  start?: number;
  /** How long it lasts, in seconds. Default 0.5. */
  duration?: number;
  easing?: EasingSpec;
}

function window(opts: TimingOptions, defaultDuration = 0.5): { t0: number; t1: number } {
  const t0 = opts.start ?? 0;
  const t1 = t0 + (opts.duration ?? defaultDuration);
  return { t0, t1 };
}

/** Fade in (opacity 0 → 1). */
export function fadeIn(opts: TimingOptions = {}): Track[] {
  const { t0, t1 } = window(opts);
  return [
    {
      property: "opacity",
      keyframes: [
        { t: t0, value: 0 },
        { t: t1, value: 1, easing: opts.easing ?? "easeOutQuad" },
      ],
    },
  ];
}

/** Pop in with a springy overshoot (opacity + scale 0.5 → 1, easeOutBack). */
export function popIn(opts: TimingOptions = {}): Track[] {
  const { t0, t1 } = window(opts);
  return [
    {
      property: "opacity",
      keyframes: [
        { t: t0, value: 0 },
        { t: t0 + (t1 - t0) * 0.5, value: 1, easing: "easeOutQuad" },
      ],
    },
    {
      property: "scale",
      keyframes: [
        { t: t0, value: 0.5 },
        { t: t1, value: 1, easing: "easeOutBack" },
      ],
    },
  ];
}

/** Pop in with a true spring settle (scale 0 → 1 via easeOutSpring + fade) — livelier than popIn. */
export function springIn(opts: TimingOptions = {}): Track[] {
  const { t0, t1 } = window(opts, 0.7);
  return [
    {
      property: "opacity",
      keyframes: [
        { t: t0, value: 0 },
        { t: t0 + (t1 - t0) * 0.4, value: 1, easing: "easeOutQuad" },
      ],
    },
    {
      property: "scale",
      keyframes: [
        { t: t0, value: 0 },
        { t: t1, value: 1, easing: "easeOutSpring" },
      ],
    },
  ];
}

export interface FollowPathOptions extends TimingOptions {
  /** Waypoints in parent coordinates; the node's x/y animate through them in order. */
  points: { x: number; y: number }[];
}

/** Animate a node along a path of waypoints (x/y tracks timed evenly across the window). */
export function followPath(opts: FollowPathOptions): Track[] {
  const pts = opts.points;
  if (pts.length < 2) return [];
  const { t0, t1 } = window(opts, 1);
  const at = (i: number): number => t0 + ((t1 - t0) * i) / (pts.length - 1);
  const track = (axis: "x" | "y"): Track => ({
    property: axis,
    keyframes: pts.map((p, i) => ({ t: at(i), value: p[axis], ...(i > 0 && opts.easing !== undefined ? { easing: opts.easing } : {}) })),
  });
  return [track("x"), track("y")];
}

/** Spin in (rotation -180 → 0 with overshoot, plus fade). */
export function spinIn(opts: TimingOptions = {}): Track[] {
  const { t0, t1 } = window(opts);
  return [
    {
      property: "opacity",
      keyframes: [
        { t: t0, value: 0 },
        { t: t1, value: 1, easing: "easeOutQuad" },
      ],
    },
    {
      property: "rotation",
      keyframes: [
        { t: t0, value: -180 },
        { t: t1, value: 0, easing: "easeOutBack" },
      ],
    },
  ];
}

export interface SlideInOptions extends TimingOptions {
  axis: "x" | "y";
  /** Position to slide from. */
  from: number;
  /** Resting position. */
  to: number;
}

/** Slide in along an axis from `from` to `to`, fading up. */
export function slideIn(opts: SlideInOptions): Track[] {
  const { t0, t1 } = window(opts);
  return [
    {
      property: opts.axis,
      keyframes: [
        { t: t0, value: opts.from },
        { t: t1, value: opts.to, easing: opts.easing ?? "easeOutCubic" },
      ],
    },
    {
      property: "opacity",
      keyframes: [
        { t: t0, value: 0 },
        { t: t1, value: 1, easing: "easeOutQuad" },
      ],
    },
  ];
}

/** Fade out (opacity 1 → 0). */
export function fadeOut(opts: TimingOptions = {}): Track[] {
  const { t0, t1 } = window(opts);
  return [
    {
      property: "opacity",
      keyframes: [
        { t: t0, value: 1 },
        { t: t1, value: 0, easing: opts.easing ?? "easeInQuad" },
      ],
    },
  ];
}

/** Pop out (scale 1 → 0.5 with anticipation, fading). */
export function popOut(opts: TimingOptions = {}): Track[] {
  const { t0, t1 } = window(opts);
  return [
    {
      property: "opacity",
      keyframes: [
        { t: t0, value: 1 },
        { t: t1, value: 0, easing: "easeInQuad" },
      ],
    },
    {
      property: "scale",
      keyframes: [
        { t: t0, value: 1 },
        { t: t1, value: 0.5, easing: "easeInBack" },
      ],
    },
  ];
}

export interface PulseOptions extends TimingOptions {
  /** Peak scale. Default 1.15. */
  scaleTo?: number;
}

/** A single attention pulse (scale up then back), great for "look here" signaling. */
export function pulse(opts: PulseOptions = {}): Track[] {
  const t0 = opts.start ?? 0;
  const dur = opts.duration ?? 0.4;
  const mid = t0 + dur / 2;
  const t1 = t0 + dur;
  const peak = opts.scaleTo ?? 1.15;
  return [
    {
      property: "scale",
      keyframes: [
        { t: t0, value: 1 },
        { t: mid, value: peak, easing: "easeOutQuad" },
        { t: t1, value: 1, easing: "easeInOutQuad" },
      ],
    },
  ];
}

/** Typewriter reveal for a text node (reveal 0 → 1). */
export function typewriter(opts: TimingOptions = {}): Track[] {
  const { t0, t1 } = window(opts, 1);
  return [
    {
      property: "reveal",
      keyframes: [
        { t: t0, value: 0 },
        { t: t1, value: 1, easing: opts.easing ?? "linear" },
      ],
    },
  ];
}

/**
 * Stagger a preset across `count` items: item i starts at `start + i*step`. Returns
 * one Track[] per item, in order — the cascade that makes a row of things feel
 * choreographed rather than appearing all at once.
 */
export function stagger(
  count: number,
  makePreset: (itemStart: number, index: number) => Track[],
  opts: { start?: number; step?: number } = {},
): Track[][] {
  const start = opts.start ?? 0;
  const step = opts.step ?? 0.15;
  return Array.from({ length: count }, (_, i) => makePreset(start + i * step, i));
}

/** Merge several track arrays; if two target the same property, the later one wins. */
export function mergeTracks(...groups: Track[][]): Track[] {
  const byProp = new Map<string, Track>();
  for (const group of groups) for (const track of group) byProp.set(track.property, track);
  return [...byProp.values()];
}
