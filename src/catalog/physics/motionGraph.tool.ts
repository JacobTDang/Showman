import { z } from "zod";
import { motionGraph, type MotionSeries } from "../../physics/motion.js";
import type { BuilderTool } from "../types.js";

/**
 * physics.motionGraph — motion.ts's motionGraph() takes a raw `fn: (t) => number` per
 * series, which neither a Zod schema nor an LLM's JSON output can express. This wraps
 * it behind a named-preset layer: each series picks one of a small set of pure-math
 * shapes (the ones kinematics curricula actually use) + a numeric params record, both
 * fully JSON-serializable. The classic "moving man" 3-stack (position/velocity/
 * acceleration for one motion) is just three series sharing the same underlying a/v0
 * values under different presets — see `example`.
 */

const Preset = z.enum(["constant", "linear", "quadratic", "projectile-height", "damped-oscillation"]);
type Preset = z.infer<typeof Preset>;

const SeriesParams = z.object({
  label: z.string(),
  preset: Preset,
  /** constant: the flat value. */
  value: z.number().default(0),
  /** linear: value = slope*t + intercept. */
  slope: z.number().default(1),
  intercept: z.number().default(0),
  /** quadratic: value = 0.5*a*t^2 + v0*t + x0 (kinematics: a=acceleration, v0=initial velocity, x0=initial position). */
  a: z.number().default(1),
  v0: z.number().default(0),
  x0: z.number().default(0),
  /** projectile-height: value = speed*sin(angle)*t - 0.5*9.8*t^2. */
  speed: z.number().default(20),
  angle: z.number().min(1).max(89).default(45),
  /** damped-oscillation: value = amplitude*exp(-decay*t)*cos(omega*t). */
  amplitude: z.number().default(1),
  decay: z.number().min(0).default(0.5),
  omega: z.number().positive().default(2 * Math.PI),
  color: z.string().optional(),
  yMin: z.number().optional(),
  yMax: z.number().optional(),
});
type SeriesParams = z.infer<typeof SeriesParams>;

const Params = z.object({
  series: z.array(SeriesParams).min(1).max(4),
  tMax: z.number().positive().max(60).default(4),
  width: z.number().positive().max(1200).default(360),
  height: z.number().positive().max(1200).default(360),
  trace: z.boolean().default(true),
  theme: z.string().optional(),
});
type MotionGraphParams = z.infer<typeof Params>;

/** Preset -> pure closure. Exported so its math is unit-testable without going through build(). */
export function curveFor(p: SeriesParams): (t: number) => number {
  switch (p.preset) {
    case "constant":
      return () => p.value;
    case "linear":
      return (t) => p.slope * t + p.intercept;
    case "quadratic":
      return (t) => 0.5 * p.a * t * t + p.v0 * t + p.x0;
    case "projectile-height": {
      const rad = (p.angle * Math.PI) / 180;
      return (t) => p.speed * Math.sin(rad) * t - 0.5 * 9.8 * t * t;
    }
    case "damped-oscillation":
      return (t) => p.amplitude * Math.exp(-p.decay * t) * Math.cos(p.omega * t);
  }
}

export const motionGraphTool: BuilderTool<MotionGraphParams> = {
  name: "physics.motionGraph",
  domain: "physics",
  level: "node",
  description: "stacked position/velocity/acceleration-vs-time graphs from named kinematics presets, each with a trace dot and a shared time sweep",
  keywords: [
    "motion graph",
    "position vs time",
    "velocity vs time",
    "acceleration vs time",
    "position time graph",
    "velocity time graph",
    "kinematics",
    "moving man",
    "x-t graph",
    "v-t graph",
  ],
  params: Params,
  example: {
    series: [
      {
        label: "x",
        preset: "quadratic",
        value: 0,
        slope: 1,
        intercept: 0,
        a: 2,
        v0: 0,
        x0: 0,
        speed: 20,
        angle: 45,
        amplitude: 1,
        decay: 0.5,
        omega: 2 * Math.PI,
      },
      {
        label: "v",
        preset: "linear",
        value: 0,
        slope: 2,
        intercept: 0,
        a: 1,
        v0: 0,
        x0: 0,
        speed: 20,
        angle: 45,
        amplitude: 1,
        decay: 0.5,
        omega: 2 * Math.PI,
      },
      {
        label: "a",
        preset: "constant",
        value: 2,
        slope: 1,
        intercept: 0,
        a: 1,
        v0: 0,
        x0: 0,
        speed: 20,
        angle: 45,
        amplitude: 1,
        decay: 0.5,
        omega: 2 * Math.PI,
      },
    ],
    tMax: 4,
    width: 360,
    height: 360,
    trace: true,
  },
  build(p) {
    const series: MotionSeries[] = p.series.map((s) => ({
      label: s.label,
      fn: curveFor(s),
      ...(s.color ? { color: s.color } : {}),
      ...(s.yMin !== undefined ? { yMin: s.yMin } : {}),
      ...(s.yMax !== undefined ? { yMax: s.yMax } : {}),
    }));
    const node = motionGraph({
      x: 0,
      y: 0,
      width: p.width,
      height: p.height,
      tMax: p.tMax,
      series,
      trace: p.trace,
      ...(p.theme ? { theme: p.theme } : {}),
    });
    return { node, bbox: { w: p.width, h: p.height } };
  },
};
