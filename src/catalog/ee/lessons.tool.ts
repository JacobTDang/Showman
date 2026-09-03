import { z } from "zod";
import type { BuilderTool } from "../types.js";
import { buildTheoremOne } from "../../lessons/ee/theoremOne.js";
import { buildRcFilters } from "../../lessons/ee/rcFilters.js";
import { buildTransferCharacteristic } from "../../lessons/ee/transferCharacteristic.js";
import { buildPolesStepResponse } from "../../lessons/ee/polesStepResponse.js";
import { buildSinusoids } from "../../lessons/ee/sinusoids.js";
import { buildImpedancePhasors } from "../../lessons/ee/impedancePhasors.js";
import { buildCapacitorInductor } from "../../lessons/ee/capacitorInductor.js";
import { buildOhmKvlKcl } from "../../lessons/ee/ohmKvlKcl.js";

/**
 * EE 230 animated circuit lessons, one scene-level tool each. Every lesson holds the
 * three views the course is organised around — schematic, waveforms against time, and
 * the transfer view — in one fixed 1280×720 layout, driven from one clock.
 */

const rcParams = z.object({
  R: z.number().positive().default(1000).describe("resistance, ohms"),
  C: z.number().positive().default(100e-9).describe("capacitance, farads"),
  theme: z.string().optional(),
});
type RcParams = z.infer<typeof rcParams>;

function lesson<P>(tool: Omit<BuilderTool<P>, "domain" | "level">): BuilderTool {
  return { domain: "physics", level: "scene", ...tool } as BuilderTool;
}

export const eeLessonTools: BuilderTool[] = [
  lesson<RcParams>({
    name: "ee.theoremOne",
    description:
      "Theorem 1 made visible: an RC lowpass with a sinusoid in and the frequency swept through the corner — the scope shows the output shrink and lag while a dot rides the Bode plot, with |T| and arg T read live",
    keywords: [
      "theorem 1",
      "sinusoidal steady state",
      "transfer function",
      "bode plot",
      "frequency response",
      "rc lowpass",
      "corner frequency",
      "-3 db",
      "phase shift",
    ],
    params: rcParams,
    example: { R: 1000, C: 100e-9 },
    buildScene: (p) => buildTheoremOne(p),
  }),
  lesson<RcParams>({
    name: "ee.rcFilters",
    description:
      "RC lowpass and highpass side by side under one frequency sweep: the outputs trade places at the corner, and both Bode dots meet at -3 dB",
    keywords: [
      "rc filter",
      "lowpass",
      "highpass",
      "low-pass",
      "high-pass",
      "pass band",
      "stop band",
      "crossover",
      "corner frequency",
      "cutoff frequency",
    ],
    params: rcParams,
    example: { R: 1000, C: 100e-9 },
    buildScene: (p) => buildRcFilters(p),
  }),
  lesson<{ gain: number; theme?: string }>({
    name: "ee.transferCharacteristic",
    description:
      "The transfer characteristic V_out against V_in: linear, weakly nonlinear, and clipped side by side, each with a dot at the live operating point while one sinusoid drives all three",
    keywords: [
      "transfer characteristic",
      "transfer characteristics",
      "nonlinear",
      "linear system",
      "clipping",
      "distortion",
      "saturation",
      "vout vs vin",
      "operating point",
    ],
    params: z.object({ gain: z.number().positive().default(1.5).describe("small-signal gain"), theme: z.string().optional() }),
    example: { gain: 1.5 },
    buildScene: (p) => buildTransferCharacteristic(p),
  }),
  lesson<RcParams & { speedup: number }>({
    name: "ee.polesStepResponse",
    description: "One pole at s = -1/tau and the step response it produces; slide the pole left and watch the same step answered faster",
    keywords: ["pole", "poles", "step response", "time constant", "s-plane", "s plane", "natural response", "exponential response", "63%"],
    params: rcParams.extend({ speedup: z.number().min(1.5).max(10).default(3).describe("how much smaller the second time constant is") }),
    example: { R: 1000, C: 100e-9, speedup: 3 },
    buildScene: (p) => buildPolesStepResponse(p),
  }),
  lesson<{ theme?: string }>({
    name: "ee.sinusoids",
    description:
      "The three knobs on a sinusoid -- amplitude, frequency, phase -- turned one at a time beside a reference, with the values read live",
    keywords: ["sinusoid", "sine wave", "amplitude", "frequency", "phase", "period", "cosine", "waveform basics"],
    params: z.object({ theme: z.string().optional() }),
    example: {},
    buildScene: (p) => buildSinusoids(p),
  }),
  lesson<{ C: number; L: number; theme?: string }>({
    name: "ee.impedancePhasors",
    description:
      "A phasor spinning beside the sinusoid it casts, then |Z_C| falling and |Z_L| rising with frequency on one plot, crossing at resonance",
    keywords: [
      "phasor",
      "phasors",
      "impedance",
      "complex impedance",
      "reactance",
      "capacitive reactance",
      "inductive reactance",
      "euler",
      "resonance",
      "1/jwc",
      "jwl",
    ],
    params: z.object({ C: z.number().positive().default(100e-9), L: z.number().positive().default(10e-3), theme: z.string().optional() }),
    example: { C: 100e-9, L: 10e-3 },
    buildScene: (p) => buildImpedancePhasors(p),
  }),
  lesson<{ C: number; L: number; theme?: string }>({
    name: "ee.capacitorInductor",
    description:
      "Why current leads voltage in a capacitor and lags in an inductor: i = C dv/dt and v = L di/dt drawn on one time axis so the quarter-cycle offsets are visible",
    keywords: [
      "capacitor",
      "inductor",
      "i-v relationship",
      "current leads",
      "current lags",
      "90 degrees",
      "dv/dt",
      "di/dt",
      "eli the ice man",
    ],
    params: z.object({ C: z.number().positive().default(100e-9), L: z.number().positive().default(10e-3), theme: z.string().optional() }),
    example: { C: 100e-9, L: 10e-3 },
    buildScene: (p) => buildCapacitorInductor(p),
  }),
  lesson<{ V: number; R1: number; R2: number; R3: number; theme?: string }>({
    name: "ee.ohmKvlKcl",
    description:
      "Ohm's law, KVL and KCL read live off a circuit: a series loop with every voltage and current counted, then a parallel branch appears and the currents split at the node",
    keywords: [
      "ohm's law",
      "ohms law",
      "kvl",
      "kcl",
      "kirchhoff",
      "voltage law",
      "current law",
      "series circuit",
      "parallel circuit",
      "node",
      "loop",
    ],
    params: z.object({
      V: z.number().positive().default(12),
      R1: z.number().positive().default(1000),
      R2: z.number().positive().default(2000),
      R3: z.number().positive().default(2000),
      theme: z.string().optional(),
    }),
    example: { V: 12, R1: 1000, R2: 2000, R3: 2000 },
    buildScene: (p) => buildOhmKvlKcl(p),
  }),
];
