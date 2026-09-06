import type { LessonPhrases } from "./phrases.js";

/**
 * Tier 4 — comparators, hysteresis, waveform generation.
 *
 * The three lessons are one story told three times, so their topics overlap in a way Tiers
 * 0–2 never had to handle: "a comparator with hysteresis" IS the Schmitt trigger, and
 * "schmitt trigger oscillator" IS the relaxation oscillator. Routing takes the longest
 * matching phrase and then cancels if a second lesson matches something that is not a
 * fragment of the winner, so a brief naming two of these three would select nothing at all
 * unless the compound is claimed explicitly by the lesson that actually teaches it. Hence
 * the compounds below: they exist to keep a real brief on the right lesson, not to catch
 * more briefs.
 *
 * As in Tier 2, bare "op amp" is deliberately absent — it appears in almost every brief any
 * of these lessons will be asked, and claiming it here would cancel all of them.
 */
export const TIER4_PHRASES: LessonPhrases[] = [
  {
    name: "ee.comparator",
    phrases: [
      "comparator",
      "voltage comparator",
      "op amp comparator",
      "comparator circuit",
      "threshold detector",
      "level detector",
      "zero crossing detector",
      "zero cross detector",
      "comparator chatter",
    ],
  },
  {
    name: "ee.schmittTrigger",
    phrases: [
      "schmitt trigger",
      "schmitt",
      "hysteresis",
      "hysteresis loop",
      "hysteresis comparator",
      "comparator with hysteresis",
      "schmitt trigger comparator",
      "comparator hysteresis",
      "two thresholds",
      "upper and lower threshold",
      "noise immunity",
    ],
  },
  {
    name: "ee.relaxationOscillator",
    phrases: [
      "relaxation oscillator",
      "astable",
      "astable multivibrator",
      "square wave generator",
      "square wave oscillator",
      "schmitt trigger oscillator",
      "op amp oscillator",
      "waveform generator",
      "free running oscillator",
    ],
  },
];
