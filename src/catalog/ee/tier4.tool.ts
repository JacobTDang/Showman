import { z } from "zod";
import type { BuilderTool } from "../types.js";
import { lesson } from "./define.js";
import { buildComparator } from "../../lessons/ee/comparator.js";
import { buildSchmittTrigger } from "../../lessons/ee/schmittTrigger.js";
import { buildRelaxationOscillator } from "../../lessons/ee/relaxationOscillator.js";

/**
 * Tier 4 — comparators, hysteresis and waveform generation (EE 230 weeks 7-9, Sedra/Smith
 * ch. 18). Three lessons that are one argument: an op-amp with no feedback answers a
 * question but chatters, positive feedback gives the threshold a memory and stops it, and
 * the same circuit fed by its own capacitor becomes an oscillator.
 */

const theme = z.string().optional();

export const tier4Tools: BuilderTool[] = [
  lesson<{ vRef: number; theme?: string }>({
    name: "ee.comparator",
    description:
      "The open-loop op-amp as a comparator: the output snapping between the rails as a slow noisy input crosses V_ref, the near-vertical step in the transfer view with the dot flicking across it, and the burst of edges the noise produces at every crossing",
    keywords: [
      "comparator",
      "voltage comparator",
      "threshold detector",
      "zero crossing detector",
      "level detector",
      "open-loop op amp",
      "chatter",
      "logic level from an analog signal",
      "rail to rail output",
    ],
    params: z.object({
      vRef: z.number().default(5).describe("the reference the input is compared against, volts"),
      theme,
    }),
    example: { vRef: 5 },
    buildScene: (p) => buildComparator(p),
  }),
  lesson<{ R1: number; R2: number; theme?: string }>({
    name: "ee.schmittTrigger",
    description:
      "The inverting Schmitt trigger: positive feedback through R_1 and R_2 gives two thresholds at plus and minus beta times V_sat, the same noisy input now produces one clean edge per crossing, and the transfer view is a hysteresis loop traced live",
    keywords: [
      "schmitt trigger",
      "hysteresis",
      "hysteresis loop",
      "two thresholds",
      "positive feedback",
      "noise immunity",
      "comparator with hysteresis",
      "upper and lower trip point",
      "debounce",
    ],
    params: z.object({
      R1: z.number().positive().default(10e3).describe("resistor from the divider tap to ground, ohms"),
      R2: z.number().positive().default(16e3).describe("resistor from the output back to the divider tap, ohms"),
      theme,
    }),
    example: { R1: 10e3, R2: 16e3 },
    buildScene: (p) => buildSchmittTrigger(p),
  }),
  lesson<{ R: number; C: number; theme?: string }>({
    name: "ee.relaxationOscillator",
    description:
      "The Schmitt trigger charging its own capacitor: the exponential sawtooth running between the two thresholds, the square wave it produces, and the period 2RC ln((1+beta)/(1-beta)) read live off the scope",
    keywords: [
      "relaxation oscillator",
      "astable multivibrator",
      "square wave generator",
      "square wave oscillator",
      "waveform generator",
      "op amp oscillator",
      "free running",
      "rc timing",
      "oscillator period",
    ],
    params: z.object({
      R: z.number().positive().default(10e3).describe("timing resistor, ohms"),
      C: z.number().positive().default(10e-9).describe("timing capacitor, farads"),
      theme,
    }),
    example: { R: 10e3, C: 10e-9 },
    buildScene: (p) => buildRelaxationOscillator(p),
  }),
];
