import type { LessonPhrases } from "./phrases.js";

/**
 * Tier 5 — diodes and rectifiers.
 *
 * Each phrase names a topic, not a word a brief on something else might contain. "diode"
 * is safe on its own — nothing else in the course is called one — but "bridge" and
 * "ripple" are not, so they are only ever matched as part of a longer phrase.
 *
 * Bare "rectifier" is deliberately absent. It names the family, not one of these two
 * lessons, and a brief like "ripple on a rectifier with a filter capacitor" would then hit
 * both of them: the longest phrase wins, a second lesson matches a phrase it does not
 * contain, and the router — correctly — refuses to choose and selects nothing at all.
 */
export const TIER5_PHRASES: LessonPhrases[] = [
  {
    name: "ee.diodeIV",
    phrases: [
      "diode",
      "diodes",
      "diode curve",
      "diode i v curve",
      "i v characteristic",
      "shockley equation",
      "constant voltage drop",
      "forward bias",
      "reverse bias",
      "pn junction",
      "p n junction",
      "knee voltage",
    ],
  },
  {
    name: "ee.halfWaveRectifier",
    phrases: ["half wave rectifier", "half wave rectification", "halfwave rectifier", "half wave"],
  },
  {
    name: "ee.fullWaveAndSmoothing",
    phrases: [
      "full wave rectifier",
      "full wave rectification",
      "full wave",
      "bridge rectifier",
      "diode bridge",
      "smoothing capacitor",
      "filter capacitor",
      "ripple voltage",
      "output ripple",
    ],
  },
];
