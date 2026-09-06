import type { LessonPhrases } from "./phrases.js";

/**
 * Tier 2 — ideal op-amps. Each phrase names a topic, not a category.
 *
 * The bare "op amp" is deliberately absent. A second lesson matching a phrase that is not a
 * fragment of the winning one cancels the selection outright, and "op amp" appears in
 * almost every brief tiers 3 and 4 will be asked — "op amp slew rate", "op amp comparator"
 * — so registering it here would route those briefs to nothing at all.
 */
export const TIER2_PHRASES: LessonPhrases[] = [
  {
    name: "ee.opAmpRules",
    phrases: [
      "ideal op amp",
      "ideal operational amplifier",
      "op amp rules",
      "op amp golden rules",
      "virtual ground",
      "virtual short",
      "open loop gain",
    ],
  },
  {
    name: "ee.invertingAmp",
    phrases: ["inverting amplifier", "inverting amp", "inverting configuration", "inverting op amp", "inverting stage"],
  },
  {
    name: "ee.nonInvertingSumming",
    phrases: [
      "non inverting amplifier",
      "noninverting amplifier",
      "non inverting op amp",
      "noninverting op amp",
      "non inverting stage",
      "summing amplifier",
      "summing amp",
      "summing junction",
      "adder circuit",
    ],
  },
  {
    name: "ee.integrator",
    phrases: [
      "integrator",
      "op amp integrator",
      "integrator circuit",
      "differentiator",
      "op amp differentiator",
      "differentiator circuit",
      "square wave to triangle",
      "triangle wave output",
    ],
  },
];
