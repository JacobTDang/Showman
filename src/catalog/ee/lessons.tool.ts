import { z } from "zod";
import type { BuilderTool } from "../types.js";
import { buildTheoremOne } from "../../lessons/ee/theoremOne.js";

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

export const theoremOneTool: BuilderTool<z.infer<typeof rcParams>> = {
  name: "ee.theoremOne",
  domain: "physics",
  level: "scene",
  description:
    "Theorem 1 made visible: an RC lowpass with a sinusoid in and the frequency swept through the corner — the scope shows the output shrink and lag while a dot rides the Bode plot, with |T| and ∠T read live",
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
};

export const eeLessonTools: BuilderTool[] = [theoremOneTool as BuilderTool];
