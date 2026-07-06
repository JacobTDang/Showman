import { z } from "zod";
import { titrationCurve, heatingCurve, phaseDiagram } from "../../chem/phaseGraphs.js";
import type { BuilderTool } from "../types.js";

/** chem.titrationCurve — pH vs titrant volume, with a sharp equivalence-point jump. */
const TitrationParams = z.object({
  equivalenceVolume: z.number().positive().default(25),
  maxVolume: z.number().positive().default(50),
  startPh: z.number().min(0).max(14).default(2),
  endPh: z.number().min(0).max(14).default(12),
  width: z.number().positive().max(1000).default(380),
  height: z.number().positive().max(600).default(280),
  animate: z.boolean().default(true),
  theme: z.string().optional(),
});
type TitrationParams = z.infer<typeof TitrationParams>;

export const titrationCurveTool: BuilderTool<TitrationParams> = {
  name: "chem.titrationCurve",
  domain: "chem",
  level: "node",
  description: "a titration curve: pH vs titrant volume with a sharp jump at the equivalence point",
  keywords: ["titration", "equivalence point", "ph curve", "acid base titration", "burette", "endpoint"],
  params: TitrationParams,
  example: { equivalenceVolume: 25, maxVolume: 50, startPh: 2, endPh: 12, width: 380, height: 280, animate: true },
  build(p) {
    return { node: titrationCurve({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height } };
  },
};

/** chem.heatingCurve — temperature vs heat added, flat at phase-change plateaus. */
const HeatingParams = z.object({
  meltTemp: z.number().default(0),
  boilTemp: z.number().default(100),
  startTemp: z.number().default(-20),
  endTemp: z.number().default(120),
  width: z.number().positive().max(1000).default(420),
  height: z.number().positive().max(600).default(280),
  animate: z.boolean().default(true),
  theme: z.string().optional(),
});
type HeatingParams = z.infer<typeof HeatingParams>;

export const heatingCurveTool: BuilderTool<HeatingParams> = {
  name: "chem.heatingCurve",
  domain: "chem",
  level: "node",
  description: "a heating curve: temperature vs heat added, with flat plateaus at melting and boiling",
  keywords: ["heating curve", "phase change", "melting point", "boiling point", "latent heat", "temperature"],
  params: HeatingParams,
  example: { meltTemp: 0, boilTemp: 100, startTemp: -20, endTemp: 120, width: 420, height: 280, animate: true },
  build(p) {
    return { node: heatingCurve({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height } };
  },
};

/** chem.phaseDiagram — a pressure-temperature phase diagram (solid/liquid/gas). */
const PhaseDiagramParams = z.object({
  width: z.number().positive().max(1000).default(400),
  height: z.number().positive().max(600).default(300),
  theme: z.string().optional(),
});
type PhaseDiagramParams = z.infer<typeof PhaseDiagramParams>;

export const phaseDiagramTool: BuilderTool<PhaseDiagramParams> = {
  name: "chem.phaseDiagram",
  domain: "chem",
  level: "node",
  description: "a pressure-temperature phase diagram with solid/liquid/gas regions and the triple/critical points",
  keywords: ["phase diagram", "triple point", "critical point", "solid liquid gas", "sublimation", "pressure temperature"],
  params: PhaseDiagramParams,
  example: { width: 400, height: 300 },
  build(p) {
    return { node: phaseDiagram({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height } };
  },
};
