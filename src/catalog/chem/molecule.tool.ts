import { z } from "zod";
import { moleculeFrom, moleculeNames, MOLECULE_LIBRARY } from "../../chem/moleculeLibrary.js";
import { moleculeFromSmiles } from "../../chem/smiles.js";
import { smilesToMolecule } from "../../chem/smiles.js";
import type { BuilderTool } from "../types.js";

/**
 * chem.molecule — a molecule by curated library name OR a SMILES string. Both
 * underlying builders silently render an empty group on a bad name/SMILES; this
 * tool validates up front (library names against a real enum, SMILES by actually
 * parsing) so a mistake is a structured error, never a blank scene.
 */

const NAMES = moleculeNames();

const Params = z
  .object({
    name: z
      .enum(NAMES as [string, ...string[]])
      .optional()
      .describe("a curated library molecule name"),
    smiles: z.string().optional().describe("a SMILES string, e.g. 'CCO' for ethanol"),
    scale: z.number().positive().max(200).default(46).describe("px per bond-length unit"),
    animate: z.boolean().default(true).describe("pop the atoms in and fade the bonds"),
  })
  .refine((p) => (p.name ? 1 : 0) + (p.smiles ? 1 : 0) === 1, { message: "provide exactly one of name or smiles", path: ["name"] });

type MoleculeParams = z.infer<typeof Params>;

function extentOf(atoms: { x: number; y: number }[], scale: number): { w: number; h: number } {
  if (atoms.length === 0) return { w: 200, h: 200 };
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  const pad = 60; // atom radius + label room
  return { w: (Math.max(...xs) - Math.min(...xs)) * scale + pad * 2, h: (Math.max(...ys) - Math.min(...ys)) * scale + pad * 2 };
}

export const moleculeTool: BuilderTool<MoleculeParams> = {
  name: "chem.molecule",
  domain: "chem",
  level: "node",
  description: "a molecule's 2D structure, by curated name (e.g. 'water', 'benzene') or a SMILES string",
  keywords: ["molecule", "structure", "compound", "smiles", "atoms", "bonds", "chemical structure"],
  params: Params,
  example: { name: "water", scale: 46, animate: true },
  build(p) {
    if (p.name) {
      const entry = MOLECULE_LIBRARY[p.name];
      if (!entry) throw new Error(`unknown molecule name "${p.name}"`);
      const { w, h } = extentOf(entry.atoms, p.scale);
      return { node: moleculeFrom({ name: p.name, scale: p.scale, animate: p.animate }), bbox: { w, h } };
    }
    const smiles = p.smiles!;
    const ct = smilesToMolecule(smiles);
    if (ct.atoms.length === 0) throw new Error(`could not parse SMILES "${smiles}"`);
    const { w, h } = extentOf(ct.atoms, p.scale);
    return { node: moleculeFromSmiles({ smiles, scale: p.scale, animate: p.animate }), bbox: { w, h } };
  },
};
