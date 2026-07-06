import { z } from "zod";
import { rayDiagram } from "../../physics/optics.js";
import { bohrAtom } from "../../physics/modern.js";
import { energyLevels } from "../../physics/modern.js";
import { emSpectrum } from "../../physics/fields.js";
import type { BuilderTool } from "../types.js";

/** physics.rayDiagram — a thin-lens ray diagram (principal rays + image). */
const RayDiagramParams = z.object({
  focalLength: z.number().positive().max(300).describe("focal length in px"),
  objectDistance: z.number().positive().max(500),
  objectHeight: z.number().max(200).default(60),
  width: z.number().positive().max(1000).default(400),
  height: z.number().positive().max(500).default(240),
  animate: z.boolean().default(true),
  theme: z.string().optional(),
});
type RayDiagramParams = z.infer<typeof RayDiagramParams>;

export const rayDiagramTool: BuilderTool<RayDiagramParams> = {
  name: "physics.rayDiagram",
  domain: "physics",
  level: "node",
  description: "a thin-lens ray diagram: object, lens, principal rays, and the formed image",
  keywords: ["lens", "ray diagram", "optics", "focal length", "image formation", "converging", "diverging", "refraction"],
  params: RayDiagramParams,
  example: { focalLength: 100, objectDistance: 200, objectHeight: 60, width: 400, height: 240, animate: true },
  build(p) {
    return {
      node: rayDiagram({
        x: 0,
        y: p.height / 2,
        width: p.width,
        height: p.height,
        focalLength: p.focalLength,
        object: { distance: p.objectDistance, height: p.objectHeight },
        ...(p.theme ? { theme: p.theme } : {}),
        animate: p.animate,
      }),
      bbox: { w: p.width, h: p.height },
    };
  },
};

/** physics.bohrAtom — a labeled nucleus with concentric electron shells. */
const BohrAtomParams = z.object({
  shells: z.array(z.number().int().min(0).max(18)).min(1).max(7).describe("electrons per shell, innermost first"),
  symbol: z.string().max(4).optional(),
  animate: z.boolean().default(false).describe("orbit the electrons"),
  theme: z.string().optional(),
});
type BohrAtomParams = z.infer<typeof BohrAtomParams>;

export const bohrAtomTool: BuilderTool<BohrAtomParams> = {
  name: "physics.bohrAtom",
  domain: "physics",
  level: "node",
  description: "a Bohr model atom: nucleus with concentric electron shells",
  keywords: ["atom", "bohr model", "electron", "shell", "nucleus", "orbital"],
  params: BohrAtomParams,
  example: { shells: [2, 8, 1], symbol: "Na", animate: false },
  build(p) {
    const shellGap = 26;
    const r = 22 + p.shells.length * shellGap + 20;
    return { node: bohrAtom({ x: r, y: r, shellGap, ...p }), bbox: { w: r * 2, h: r * 2 } };
  },
};

/** physics.energyLevels — hydrogen-like atomic energy-level diagram. */
const EnergyLevelsParams = z.object({
  levels: z.number().int().min(2).max(8).default(4),
  transition: z.object({ from: z.number().int().min(1), to: z.number().int().min(1) }).optional(),
  width: z.number().positive().max(600).default(300),
  height: z.number().positive().max(500).default(280),
  theme: z.string().optional(),
});
type EnergyLevelsParams = z.infer<typeof EnergyLevelsParams>;

export const energyLevelsTool: BuilderTool<EnergyLevelsParams> = {
  name: "physics.energyLevels",
  domain: "physics",
  level: "node",
  description: "an atomic energy-level diagram with an optional photon transition (emission/absorption)",
  keywords: ["energy levels", "atom", "photon", "emission", "absorption", "transition", "quantum", "hydrogen"],
  params: EnergyLevelsParams,
  example: { levels: 4, transition: { from: 3, to: 1 }, width: 300, height: 280 },
  build(p) {
    return { node: energyLevels({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height } };
  },
};

/** physics.emSpectrum — the electromagnetic spectrum as labeled bands. */
const EmSpectrumParams = z.object({
  width: z.number().positive().max(1000).default(500),
  height: z.number().positive().max(200).default(80),
  labels: z.boolean().default(true),
  theme: z.string().optional(),
});
type EmSpectrumParams = z.infer<typeof EmSpectrumParams>;

export const emSpectrumTool: BuilderTool<EmSpectrumParams> = {
  name: "physics.emSpectrum",
  domain: "physics",
  level: "node",
  description: "the electromagnetic spectrum as labeled bands (radio through gamma), visible as a rainbow",
  keywords: ["electromagnetic spectrum", "radio", "microwave", "infrared", "visible light", "ultraviolet", "x-ray", "gamma", "wavelength"],
  params: EmSpectrumParams,
  example: { width: 500, height: 80, labels: true },
  build(p) {
    return { node: emSpectrum({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height + (p.labels ? 30 : 0) } };
  },
};
