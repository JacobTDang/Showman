/**
 * Easing curves. An easing maps progress in [0, 1] (linear time within a segment)
 * to eased progress. Named curves cover the common library; a custom
 * cubic-bezier `[x1, y1, x2, y2]` (CSS semantics) covers everything else.
 *
 * The springy curves (back / elastic / bounce) are here from day one: they are
 * what make agent-authored motion feel animated — anticipation and overshoot —
 * rather than robotic linear tweens. M5 leans on these.
 *
 * All curves are pure; no randomness, no clock.
 */

import type { EasingName, EasingSpec } from "../spec/types.js";

const c1 = 1.70158; // back overshoot
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3; // elastic
const n1 = 7.5625; // bounce
const d1 = 2.75;

const NAMED: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,

  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),

  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),

  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  easeInBack: (t) => c3 * t * t * t - c1 * t * t,
  easeOutBack: (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  easeInOutBack: (t) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,

  easeOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },

  easeOutBounce: (t) => {
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) {
      const u = t - 1.5 / d1;
      return n1 * u * u + 0.75;
    }
    if (t < 2.5 / d1) {
      const u = t - 2.25 / d1;
      return n1 * u * u + 0.9375;
    }
    const u = t - 2.625 / d1;
    return n1 * u * u + 0.984375;
  },
};

/** Evaluate a cubic-bezier easing `[x1, y1, x2, y2]` at progress `t` (CSS semantics). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  // The curve is parameterized by s in [0,1]; we must find s such that bezierX(s) = t,
  // then evaluate bezierY(s). Solve with a few Newton-Raphson steps, bisection fallback.
  const bezier = (a: number, b: number, s: number): number => {
    const mt = 1 - s;
    return 3 * mt * mt * s * a + 3 * mt * s * s * b + s * s * s;
  };
  const bezierDeriv = (a: number, b: number, s: number): number => {
    const mt = 1 - s;
    return 3 * mt * mt * a + 6 * mt * s * (b - a) + 3 * s * s * (1 - b);
  };

  let s = t;
  for (let i = 0; i < 8; i++) {
    const x = bezier(x1, x2, s) - t;
    if (Math.abs(x) < 1e-6) return bezier(y1, y2, s);
    const dx = bezierDeriv(x1, x2, s);
    if (Math.abs(dx) < 1e-6) break;
    s -= x / dx;
  }
  // Bisection fallback for robustness.
  let lo = 0;
  let hi = 1;
  s = t;
  for (let i = 0; i < 40; i++) {
    const x = bezier(x1, x2, s);
    if (Math.abs(x - t) < 1e-6) break;
    if (x < t) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return bezier(y1, y2, s);
}

/** Resolve an easing spec to a pure function `[0,1] -> [0,1]`. Unknown names fall back to linear. */
export function resolveEasing(spec: EasingSpec | undefined): (t: number) => number {
  if (spec === undefined) return NAMED.linear;
  if (Array.isArray(spec)) {
    const [x1, y1, x2, y2] = spec;
    return (t) => cubicBezier(x1, y1, x2, y2, t);
  }
  return NAMED[spec] ?? NAMED.linear;
}

/** Apply an easing spec to a single progress value. */
export function applyEasing(spec: EasingSpec | undefined, t: number): number {
  return resolveEasing(spec)(t);
}
