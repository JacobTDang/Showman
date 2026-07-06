import { z } from "zod";
import { pendulum } from "../../physics/oscillator.js";
import { massSpring } from "../../physics/oscillator.js";
import type { BuilderTool } from "../types.js";

/** physics.pendulum — a swinging pendulum (simple harmonic-ish motion). */
const PendulumParams = z.object({
  length: z.number().positive().max(400).default(180),
  amplitude: z.number().positive().max(90).default(30).describe("swing amplitude in degrees"),
  period: z.number().positive().max(10).default(2).describe("seconds per full swing"),
  cycles: z.number().positive().max(5).default(2),
  bobRadius: z.number().positive().max(60).default(16),
  theme: z.string().optional(),
});
type PendulumParams = z.infer<typeof PendulumParams>;

export const pendulumTool: BuilderTool<PendulumParams> = {
  name: "physics.pendulum",
  domain: "physics",
  level: "node",
  description: "a swinging pendulum: arm rotating about a fixed pivot",
  keywords: ["pendulum", "swing", "oscillate", "period", "amplitude", "simple harmonic motion"],
  params: PendulumParams,
  example: { length: 180, amplitude: 30, period: 2, cycles: 2, bobRadius: 16 },
  build(p) {
    const pivot = { x: p.length + p.bobRadius + 20, y: p.bobRadius + 10 };
    return { node: pendulum({ pivot, ...p }), bbox: { w: (p.length + p.bobRadius) * 2 + 20, h: p.length + p.bobRadius * 2 + 30 } };
  },
};

/** physics.massSpring — a vertical mass-spring oscillator. */
const MassSpringParams = z.object({
  restLength: z.number().positive().max(300).default(100),
  amplitude: z.number().positive().max(150).default(40),
  period: z.number().positive().max(10).default(1.5),
  cycles: z.number().positive().max(5).default(2),
  massSize: z.number().positive().max(100).default(36),
  coils: z.number().int().min(2).max(20).default(8),
  theme: z.string().optional(),
});
type MassSpringParams = z.infer<typeof MassSpringParams>;

export const massSpringTool: BuilderTool<MassSpringParams> = {
  name: "physics.massSpring",
  domain: "physics",
  level: "node",
  description: "a vertical mass-spring oscillating in simple harmonic motion",
  keywords: ["spring", "mass", "oscillate", "simple harmonic motion", "SHM", "hooke's law", "bounce"],
  params: MassSpringParams,
  example: { restLength: 100, amplitude: 40, period: 1.5, cycles: 2, massSize: 36, coils: 8 },
  build(p) {
    const anchor = { x: p.massSize, y: 20 };
    const h = 20 + p.restLength + p.amplitude + p.massSize + 20;
    return { node: massSpring({ anchor, ...p }), bbox: { w: p.massSize * 2 + 20, h } };
  },
};
