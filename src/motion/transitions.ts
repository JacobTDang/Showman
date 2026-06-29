/**
 * Transition presets — built on the compositing layer. The enter/exit presets in
 * `presets.ts` (fadeIn / slideIn / popIn / …) cover most beat transitions; these add the
 * compositing-based ones (a focus-pull blur) and a scene-to-scene cross-fade helper.
 */

import type { Track } from "../spec/types.js";
import type { TimingOptions } from "./presets.js";

export interface BlurOptions extends TimingOptions {
  /** Peak blur radius in px. Default 12. */
  amount?: number;
}

/** Focus-pull in: blur `amount`px → 0 while fading in. */
export function blurIn(opts: BlurOptions = {}): Track[] {
  const t0 = opts.start ?? 0;
  const t1 = t0 + (opts.duration ?? 0.6);
  const a = opts.amount ?? 12;
  return [
    {
      property: "blur",
      keyframes: [
        { t: t0, value: a },
        { t: t1, value: 0, easing: opts.easing ?? "easeOutCubic" },
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

/** Focus-pull out: blur 0 → `amount`px while fading out. */
export function blurOut(opts: BlurOptions = {}): Track[] {
  const t0 = opts.start ?? 0;
  const t1 = t0 + (opts.duration ?? 0.6);
  const a = opts.amount ?? 12;
  return [
    {
      property: "blur",
      keyframes: [
        { t: t0, value: 0 },
        { t: t1, value: a, easing: opts.easing ?? "easeInCubic" },
      ],
    },
    {
      property: "opacity",
      keyframes: [
        { t: t0, value: 1 },
        { t: t1, value: 0, easing: "easeInQuad" },
      ],
    },
  ];
}

export interface CrossFadeOptions {
  /** When the transition starts (seconds). */
  at: number;
  duration?: number;
}

/**
 * Scene-to-scene cross-fade: the `outgoing` tracks fade the previous beat's content out while
 * the `incoming` tracks fade the next beat's content in over the same window. Attach each to the
 * respective group's `tracks`.
 */
export function crossFade(opts: CrossFadeOptions): { outgoing: Track[]; incoming: Track[] } {
  const t0 = opts.at;
  const t1 = t0 + (opts.duration ?? 0.5);
  return {
    outgoing: [
      {
        property: "opacity",
        keyframes: [
          { t: t0, value: 1 },
          { t: t1, value: 0, easing: "easeInOutQuad" },
        ],
      },
    ],
    incoming: [
      {
        property: "opacity",
        keyframes: [
          { t: t0, value: 0 },
          { t: t1, value: 1, easing: "easeInOutQuad" },
        ],
      },
    ],
  };
}
