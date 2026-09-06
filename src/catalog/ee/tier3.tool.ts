import { z } from "zod";
import type { BuilderTool } from "../types.js";
import { lesson } from "./define.js";
import { buildSaturation } from "../../lessons/ee/saturation.js";
import { buildSlewRate } from "../../lessons/ee/slewRate.js";
import { buildGainBandwidth } from "../../lessons/ee/gainBandwidth.js";

/**
 * Tier 3 — real op-amps (EE 230 week 6, Sedra/Smith ch. 2.6-2.8, and the op-amp-parameters
 * lab). Three lessons, each of which opens with the ideal behaviour Tier 2 teaches and then
 * shows exactly where it breaks: how far the output can go, how fast it can get there, and
 * how much gain is left by the time it does.
 */

const theme = z.string().optional();

export const tier3Tools: BuilderTool[] = [
  lesson<{ Rin: number; Rf: number; vSat: number; theme?: string }>({
    name: "ee.saturation",
    description:
      "Where the ideal gain formula runs out: the supply rails. The input amplitude climbs while the output follows it at -R_f/R_in until it reaches V_sat and flattens, with the input-peak and output-peak counters visibly parting company and the transfer line bending onto the rail",
    keywords: [
      "saturation",
      "op amp saturation",
      "clipping at the rails",
      "output swing",
      "supply rails",
      "v_sat",
      "flat topped",
      "rail to rail",
      "output voltage limit",
    ],
    params: z.object({
      Rin: z.number().positive().default(10e3).describe("input resistor, ohms"),
      Rf: z.number().positive().default(40e3).describe("feedback resistor, ohms"),
      vSat: z.number().positive().default(13).describe("output swing limit, volts"),
      theme,
    }),
    example: { Rin: 10e3, Rf: 40e3, vSat: 13 },
    buildScene: (p) => buildSaturation(p),
  }),
  lesson<{ SR: number; Vp: number; theme?: string }>({
    name: "ee.slewRate",
    description:
      "The slew rate of a 741: a square wave in, and the output degrading from square to trapezoid to triangle as the frequency rises, with the demanded dv/dt and the achieved 0.5 V/us read side by side and the full-power bandwidth named",
    keywords: [
      "slew rate",
      "slewing",
      "slew limit",
      "full power bandwidth",
      "rise time",
      "v per microsecond",
      "741 slew rate",
      "square wave response",
      "triangular output",
    ],
    params: z.object({
      SR: z.number().positive().default(0.5e6).describe("slew rate, volts per second"),
      Vp: z.number().positive().default(5).describe("square-wave peak, volts"),
      theme,
    }),
    example: { SR: 0.5e6, Vp: 5 },
    buildScene: (p) => buildSlewRate(p),
  }),
  lesson<{ A0: number; fp: number; theme?: string }>({
    name: "ee.gainBandwidth",
    description:
      "The gain-bandwidth product: the open-loop gain drawn as a curve with its single dominant pole, three closed-loop stages of gain 100, 10 and 1 overlaid on it, and a counter reading gain times bandwidth staying at 1 MHz while the two trade places",
    keywords: [
      "gain bandwidth product",
      "gain bandwidth",
      "unity gain frequency",
      "dominant pole",
      "closed loop bandwidth",
      "gbw",
      "-20 db per decade",
      "bandwidth of an amplifier",
      "compensation",
    ],
    params: z.object({
      A0: z.number().positive().default(200_000).describe("open-loop DC gain, V/V"),
      fp: z.number().positive().default(5).describe("dominant pole, Hz"),
      theme,
    }),
    example: { A0: 200_000, fp: 5 },
    buildScene: (p) => buildGainBandwidth(p),
  }),
];
