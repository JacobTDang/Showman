import type { LessonPhrases } from "./phrases.js";

/**
 * Tier 3 — real op-amps. Each phrase names a limit of the device, not a category.
 *
 * As in Tier 2, the bare "op amp" is deliberately absent: a second lesson matching a phrase
 * that is not a fragment of the winning one cancels the selection outright, and "op amp"
 * appears in almost every brief these three lessons will be asked. "open loop gain" is Tier
 * 2's and is not repeated here, and neither is "clipping" — Tier 0-1's
 * `ee.transferCharacteristic` owns that, so this tier claims "clipping at the rails", which
 * contains it and therefore wins as the longer phrase rather than cancelling against it.
 */
export const TIER3_PHRASES: LessonPhrases[] = [
  {
    name: "ee.saturation",
    phrases: [
      "saturation",
      "op amp saturation",
      "output saturation",
      "saturation voltage",
      "clipping at the rails",
      "clips at the rails",
      "clip at the rails",
      "hits the rails",
      "supply rails",
      "output swing",
      "output voltage swing",
    ],
  },
  {
    name: "ee.slewRate",
    phrases: [
      "slew rate",
      "slew",
      "slewing",
      "slew limit",
      "slew limiting",
      "slew rate limiting",
      "full power bandwidth",
      "volts per microsecond",
    ],
  },
  {
    name: "ee.gainBandwidth",
    phrases: [
      "gain bandwidth product",
      "gain bandwidth",
      "gain bandwidth tradeoff",
      "unity gain frequency",
      "unity gain bandwidth",
      "gbw",
      "closed loop bandwidth",
      "dominant pole",
      "20 db per decade",
    ],
  },
];
