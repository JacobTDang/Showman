import { z } from "zod";
import { forceDiagram } from "../../physics/vector.js";
import { inclinedPlane, energyBars } from "../../physics/motion.js";
import type { BuilderTool } from "../types.js";

/** physics.forceDiagram — labeled force arrows from a body (a free-body diagram). */
const ForceDiagramParams = z.object({
  forces: z
    .array(z.object({ label: z.string().optional(), magnitude: z.number().positive(), angle: z.number() }))
    .min(1)
    .max(6)
    .describe("angle in degrees, 0 = +x (right), 90 = up"),
  scale: z.number().positive().max(10).default(1).describe("px per magnitude unit"),
  bodyRadius: z.number().positive().max(100).default(18),
  bodyLabel: z.string().optional(),
  showComponents: z.boolean().default(false),
  theme: z.string().optional(),
});
type ForceDiagramParams = z.infer<typeof ForceDiagramParams>;

export const forceDiagramTool: BuilderTool<ForceDiagramParams> = {
  name: "physics.forceDiagram",
  domain: "physics",
  level: "node",
  description: "a free-body diagram: labeled force arrows radiating from a central body",
  keywords: ["force", "free body", "vector", "diagram", "newton", "net force", "arrow", "gravity", "friction", "normal force"],
  params: ForceDiagramParams,
  example: {
    forces: [
      { label: "gravity", magnitude: 40, angle: 270 },
      { label: "normal", magnitude: 40, angle: 90 },
    ],
    scale: 1,
    bodyRadius: 18,
    showComponents: false,
  },
  build(p) {
    const maxMag = Math.max(...p.forces.map((f) => f.magnitude)) * p.scale;
    const span = maxMag + p.bodyRadius + 40;
    return { node: forceDiagram({ x: span, y: span, ...p }), bbox: { w: span * 2, h: span * 2 } };
  },
};

/** physics.inclinedPlane — a ramp with an optional block, for force resolution. */
const InclinedPlaneParams = z.object({
  angle: z.number().min(1).max(89).describe("incline angle in degrees"),
  length: z.number().positive().max(600).default(240),
  block: z.boolean().default(true),
  showAngle: z.boolean().default(true),
  theme: z.string().optional(),
});
type InclinedPlaneParams = z.infer<typeof InclinedPlaneParams>;

export const inclinedPlaneTool: BuilderTool<InclinedPlaneParams> = {
  name: "physics.inclinedPlane",
  domain: "physics",
  level: "node",
  description: "a ramp (incline) with an optional resting block — friction/force-resolution setups",
  keywords: ["incline", "ramp", "slope", "friction", "block", "force resolution", "inclined plane"],
  params: InclinedPlaneParams,
  example: { angle: 30, length: 240, block: true, showAngle: true },
  build(p) {
    const h = p.length * Math.sin((p.angle * Math.PI) / 180) + 40;
    return { node: inclinedPlane({ x: 0, y: h, ...p }), bbox: { w: p.length + 40, h: h + 40 } };
  },
};

/** physics.energyBars — a small bar chart for KE/PE/thermal energy accounting. */
const EnergyBarsParams = z.object({
  bars: z
    .array(z.object({ label: z.string(), value: z.number().min(0) }))
    .min(1)
    .max(6),
  width: z.number().positive().max(600).default(280),
  height: z.number().positive().max(400).default(200),
  animate: z.boolean().default(true).describe("grow the bars up on"),
  theme: z.string().optional(),
});
type EnergyBarsParams = z.infer<typeof EnergyBarsParams>;

export const energyBarsTool: BuilderTool<EnergyBarsParams> = {
  name: "physics.energyBars",
  domain: "physics",
  level: "node",
  description: "a bar chart for energy accounting (kinetic/potential/thermal) — conservation of energy",
  keywords: ["energy", "kinetic", "potential", "conservation", "bar chart", "KE", "PE", "thermal"],
  params: EnergyBarsParams,
  example: {
    bars: [
      { label: "KE", value: 30 },
      { label: "PE", value: 70 },
    ],
    width: 280,
    height: 200,
    animate: true,
  },
  build(p) {
    return { node: energyBars({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height + 40 } };
  },
};
