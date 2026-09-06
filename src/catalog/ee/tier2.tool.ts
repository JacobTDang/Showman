import { z } from "zod";
import type { BuilderTool } from "../types.js";
import { lesson } from "./define.js";
import { buildOpAmpRules } from "../../lessons/ee/opAmpRules.js";
import { buildInvertingAmp } from "../../lessons/ee/invertingAmp.js";
import { buildNonInvertingSumming } from "../../lessons/ee/nonInvertingSumming.js";
import { buildIntegrator } from "../../lessons/ee/integrator.js";

/**
 * Tier 2 — ideal op-amps (EE 230 weeks 4-5, Sedra/Smith ch. 2). Four lessons on the two
 * ideal rules and the three stages they give you, each a scene-level tool of its own.
 */

const theme = z.string().optional();

export const tier2Tools: BuilderTool[] = [
  lesson<{ Rf: number; Rg: number; theme?: string }>({
    name: "ee.opAmpRules",
    description:
      "Where the two ideal op-amp rules come from: the open-loop gain climbing to 200,000, the bare device slamming to its rails, and then the loop closing and dragging v- onto v+ while the operating point settles on the vertical part of the transfer curve",
    keywords: [
      "op amp",
      "operational amplifier",
      "ideal op amp",
      "virtual ground",
      "virtual short",
      "open-loop gain",
      "negative feedback",
      "golden rules",
      "no current into the inputs",
    ],
    params: z.object({
      Rf: z.number().positive().default(10e3).describe("feedback resistor, ohms"),
      Rg: z.number().positive().default(10e3).describe("resistor from the inverting node to ground, ohms"),
      theme,
    }),
    example: { Rf: 10e3, Rg: 10e3 },
    buildScene: (p) => buildOpAmpRules(p),
  }),
  lesson<{ Rin: number; Rf1: number; Rf2: number; theme?: string }>({
    name: "ee.invertingAmp",
    description:
      "The inverting amplifier: the virtual ground turns v_in into a current, the current turns into -R_f/R_in times v_in, and doubling R_f tips the transfer line and grows the output together",
    keywords: [
      "inverting amplifier",
      "inverting amp",
      "inverting configuration",
      "negative gain",
      "rf/rin",
      "gain of an op amp",
      "op amp gain",
      "phase inversion",
    ],
    params: z.object({
      Rin: z.number().positive().default(10e3).describe("input resistor, ohms"),
      Rf1: z.number().positive().default(20e3).describe("feedback resistor before the change, ohms"),
      Rf2: z.number().positive().default(40e3).describe("feedback resistor after the change, ohms"),
      theme,
    }),
    example: { Rin: 10e3, Rf1: 20e3, Rf2: 40e3 },
    buildScene: (p) => buildInvertingAmp(p),
  }),
  lesson<{ theme?: string }>({
    name: "ee.nonInvertingSumming",
    description:
      "The non-inverting stage, gain 1 + R_f/R_g with input and output in phase, then the summing amplifier: two inputs at different frequencies on their own planes and their weighted sum on a third",
    keywords: [
      "non-inverting amplifier",
      "noninverting amplifier",
      "summing amplifier",
      "adder circuit",
      "weighted sum",
      "voltage follower",
      "buffer amplifier",
      "1 + rf/rg",
      "superposition at the summing node",
    ],
    params: z.object({ theme }),
    example: {},
    buildScene: (p) => buildNonInvertingSumming(p),
  }),
  lesson<{ R: number; C: number; V: number; theme?: string }>({
    name: "ee.integrator",
    description:
      "The op-amp integrator: a constant current into the feedback capacitor is a straight ramp, so a square wave in gives a triangle out with slope -V_in/(RC) read live; then the elements swap and the differentiator gives the square wave back",
    keywords: [
      "integrator",
      "op amp integrator",
      "differentiator",
      "op amp differentiator",
      "square wave to triangle",
      "triangle wave",
      "ramp generator",
      "1/rc integral",
      "rc feedback",
    ],
    params: z.object({
      R: z.number().positive().default(10e3).describe("input resistor, ohms"),
      C: z.number().positive().default(100e-9).describe("feedback capacitor, farads"),
      V: z.number().positive().default(1).describe("square-wave amplitude, volts"),
      theme,
    }),
    example: { R: 10e3, C: 100e-9, V: 1 },
    buildScene: (p) => buildIntegrator(p),
  }),
];
