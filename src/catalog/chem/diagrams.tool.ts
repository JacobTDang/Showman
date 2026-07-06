import { z } from "zod";
import { lewisStructure } from "../../chem/lewis.js";
import { phScale, energyDiagram } from "../../chem/graphs.js";
import { periodicTable } from "../../chem/periodicTable.js";
import { vseprShape, type Geometry } from "../../chem/vsepr.js";
import { electronConfig } from "../../chem/electronConfig.js";
import type { BuilderTool } from "../types.js";

/** chem.lewisStructure — a Lewis dot structure: center atom + ligands + lone pairs. */
const LewisParams = z.object({
  center: z.string().describe("center atom element symbol, e.g. 'C'"),
  ligands: z
    .array(
      z.object({
        el: z.string(),
        bonds: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
        lonePairs: z.number().int().min(0).default(0),
      }),
    )
    .min(1)
    .max(6),
  centerLonePairs: z.number().int().min(0).default(0),
  charge: z.number().int().optional(),
  bondLength: z.number().positive().max(200).default(70),
  theme: z.string().optional(),
});
type LewisParams = z.infer<typeof LewisParams>;

export const lewisStructureTool: BuilderTool<LewisParams> = {
  name: "chem.lewisStructure",
  domain: "chem",
  level: "node",
  description: "a Lewis dot structure: a center atom, bonded ligands, and lone pairs",
  keywords: ["lewis structure", "lewis dot", "lone pair", "bonding", "valence electrons", "octet"],
  params: LewisParams,
  example: {
    center: "O",
    ligands: [
      { el: "H", bonds: 1, lonePairs: 0 },
      { el: "H", bonds: 1, lonePairs: 0 },
    ],
    centerLonePairs: 2,
    bondLength: 70,
  },
  build(p) {
    const r = p.bondLength + 60;
    return { node: lewisStructure({ x: r, y: r, ...p }), bbox: { w: r * 2, h: r * 2 } };
  },
};

/** chem.phScale — a pH color scale with an optional pointer + label. */
const PhScaleParams = z.object({
  value: z.number().min(0).max(14).optional(),
  label: z.string().optional(),
  width: z.number().positive().max(1000).default(400),
  height: z.number().positive().max(200).default(70),
  theme: z.string().optional(),
});
type PhScaleParams = z.infer<typeof PhScaleParams>;

export const phScaleTool: BuilderTool<PhScaleParams> = {
  name: "chem.phScale",
  domain: "chem",
  level: "node",
  description: "a pH color scale (0-14) with an optional pointer marking a value",
  keywords: ["ph", "acid", "base", "acidic", "basic", "neutral", "ph scale", "indicator"],
  params: PhScaleParams,
  example: { value: 7, label: "neutral", width: 400, height: 70 },
  build(p) {
    return { node: phScale({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height + 40 } };
  },
};

/** chem.energyDiagram — a reaction energy profile (reactants/TS/products). */
const EnergyDiagramParams = z.object({
  reactantsLevel: z.number().min(0),
  productsLevel: z.number().min(0),
  activationPeak: z.number().min(0),
  catalystPeak: z.number().min(0).optional(),
  labels: z.object({ reactants: z.string().optional(), products: z.string().optional() }).optional(),
  width: z.number().positive().max(1000).default(360),
  height: z.number().positive().max(600).default(260),
  animate: z.boolean().default(true),
  theme: z.string().optional(),
});
type EnergyDiagramParams = z.infer<typeof EnergyDiagramParams>;

export const energyDiagramTool: BuilderTool<EnergyDiagramParams> = {
  name: "chem.energyDiagram",
  domain: "chem",
  level: "node",
  description: "a reaction energy profile: reactants, transition state peak, products, optional catalyst path",
  keywords: ["energy diagram", "activation energy", "reaction coordinate", "transition state", "catalyst", "exothermic", "endothermic"],
  params: EnergyDiagramParams,
  example: { reactantsLevel: 20, productsLevel: 5, activationPeak: 60, width: 360, height: 260, animate: true },
  build(p) {
    return { node: energyDiagram({ x: 0, y: 0, ...p }), bbox: { w: p.width, h: p.height } };
  },
};

/** chem.periodicTable — the periodic table with optional highlighted elements. */
const PeriodicTableParams = z.object({
  highlight: z.array(z.string()).max(10).optional().describe("element symbols to highlight"),
  dimRest: z.boolean().default(true),
  cellSize: z.number().positive().max(80).default(40),
  theme: z.string().optional(),
});
type PeriodicTableParams = z.infer<typeof PeriodicTableParams>;

export const periodicTableTool: BuilderTool<PeriodicTableParams> = {
  name: "chem.periodicTable",
  domain: "chem",
  level: "node",
  description: "the periodic table of elements, with optional highlighted elements",
  keywords: ["periodic table", "element", "atomic number", "group", "period", "metals", "nonmetals"],
  params: PeriodicTableParams,
  example: { highlight: ["Na", "Cl"], dimRest: true, cellSize: 40 },
  build(p) {
    return { node: periodicTable({ x: 0, y: 0, ...p }), bbox: { w: p.cellSize * 18, h: p.cellSize * 10 } };
  },
};

/** chem.vseprShape — a VSEPR molecular geometry with bond angles. */
const GEOMETRIES: [Geometry, ...Geometry[]] = ["linear", "bent", "trigonal-planar", "tetrahedral", "trigonal-pyramidal", "octahedral"];
const VseprParams = z.object({
  geometry: z.enum(GEOMETRIES),
  center: z.string().describe("center atom element symbol"),
  terminal: z.string().optional().describe("terminal atom element symbol"),
  bondLength: z.number().positive().max(200).default(80),
  showAngle: z.boolean().default(true),
  theme: z.string().optional(),
});
type VseprParams = z.infer<typeof VseprParams>;

export const vseprShapeTool: BuilderTool<VseprParams> = {
  name: "chem.vseprShape",
  domain: "chem",
  level: "node",
  description: "a VSEPR molecular geometry (linear, bent, tetrahedral, etc.) with bond angles",
  keywords: ["vsepr", "molecular geometry", "bond angle", "electron pair repulsion", "shape", "tetrahedral", "trigonal"],
  params: VseprParams,
  example: { geometry: "bent", center: "O", terminal: "H", bondLength: 80, showAngle: true },
  build(p) {
    const r = p.bondLength + 60;
    return { node: vseprShape({ x: r, y: r, ...p }), bbox: { w: r * 2, h: r * 2 } };
  },
};

/** chem.electronConfig — an orbital-box diagram for an element (Hund + Pauli). */
const ElectronConfigParams = z.object({
  z: z.number().int().min(1).max(118).describe("atomic number"),
  boxSize: z.number().positive().max(80).default(32),
  notation: z.boolean().default(true),
  theme: z.string().optional(),
});
type ElectronConfigParams = z.infer<typeof ElectronConfigParams>;

export const electronConfigTool: BuilderTool<ElectronConfigParams> = {
  name: "chem.electronConfig",
  domain: "chem",
  level: "node",
  description: "an orbital-box electron configuration diagram for an element (Hund's rule, Pauli exclusion)",
  keywords: ["electron configuration", "orbital", "hund's rule", "pauli exclusion", "subshell", "aufbau"],
  params: ElectronConfigParams,
  example: { z: 8, boxSize: 32, notation: true },
  build(p) {
    return { node: electronConfig({ x: 0, y: 0, ...p }), bbox: { w: 420, h: p.notation ? 220 : 180 } };
  },
};
