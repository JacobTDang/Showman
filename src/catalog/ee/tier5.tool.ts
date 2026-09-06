import { z } from "zod";
import type { BuilderTool } from "../types.js";
import { lesson } from "./define.js";
import { buildDiodeIV } from "../../lessons/ee/diodeIV.js";
import { buildHalfWaveRectifier } from "../../lessons/ee/halfWaveRectifier.js";
import { buildFullWaveAndSmoothing } from "../../lessons/ee/fullWaveAndSmoothing.js";

/**
 * Tier 5 — diodes and rectifiers, following the EE 230 diodes lab and Sedra/Smith ch. 4.
 * The exponential characteristic, the constant-voltage-drop model it justifies, and the
 * two rectifiers the model is used on.
 */
export const tier5Tools: BuilderTool[] = [
  lesson<{ R: number; theme?: string }>({
    name: "ee.diodeIV",
    description:
      "The diode i–v characteristic swept live: nanoamps in reverse, a decade of current per hundred millivolts through the knee, and the 0.7 V constant-voltage-drop model drawn over the exponential",
    keywords: [
      "diode",
      "diode curve",
      "i-v characteristic",
      "shockley equation",
      "exponential characteristic",
      "constant voltage drop",
      "forward bias",
      "reverse bias",
      "0.7 v drop",
      "knee voltage",
      "pn junction",
    ],
    params: z.object({
      R: z.number().positive().default(1000).describe("series resistance in the test circuit, ohms"),
      theme: z.string().optional(),
    }),
    example: { R: 1000 },
    buildScene: (p) => buildDiodeIV(p),
  }),
  lesson<{ Vp: number; RL: number; theme?: string }>({
    name: "ee.halfWaveRectifier",
    description:
      "A half-wave rectifier with the loop lit only while the diode is forward biased: input and output on one time axis, the missing half visible, and the operating point riding the i–v curve",
    keywords: [
      "half wave rectifier",
      "half-wave rectifier",
      "rectifier",
      "rectification",
      "ac to dc",
      "diode conducts",
      "forward biased",
      "clipped negative half",
      "peak rectifier",
    ],
    params: z.object({
      Vp: z.number().positive().default(5).describe("input amplitude, volts"),
      RL: z.number().positive().default(1000).describe("load resistance, ohms"),
      theme: z.string().optional(),
    }),
    example: { Vp: 5, RL: 1000 },
    buildScene: (p) => buildHalfWaveRectifier(p),
  }),
  lesson<{ Vp: number; RL: number; C: number; theme?: string }>({
    name: "ee.fullWaveAndSmoothing",
    description:
      "The bridge rectifier delivering both half-cycles at twice the line frequency, then a smoothing capacitor across the load with the ripple measured live against V_r = I_L/(f C)",
    keywords: [
      "full wave rectifier",
      "full-wave rectifier",
      "bridge rectifier",
      "diode bridge",
      "smoothing capacitor",
      "filter capacitor",
      "ripple voltage",
      "ripple",
      "power supply",
      "dc supply",
    ],
    params: z.object({
      Vp: z.number().positive().default(10).describe("input amplitude, volts"),
      RL: z.number().positive().default(1000).describe("load resistance, ohms"),
      C: z.number().positive().default(47e-6).describe("smoothing capacitance, farads"),
      theme: z.string().optional(),
    }),
    example: { Vp: 10, RL: 1000, C: 47e-6 },
    buildScene: (p) => buildFullWaveAndSmoothing(p),
  }),
];
