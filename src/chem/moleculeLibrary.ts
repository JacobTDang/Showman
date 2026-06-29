/**
 * Molecule library — a curated, frozen connection-table set with precomputed 2D coordinates, so an
 * author can render a common molecule by name (`moleculeFrom({ name: "benzene" })`) without supplying
 * atom coordinates. Phase 1 of the molecule layout work: a hand-laid library (a generated SMILES
 * layout pass can plug into the same `molecule()` renderer later). Pure + deterministic.
 */

import type { GroupNode } from "../spec/types.js";
import type { Atom, Bond, MoleculeOptions } from "./molecule.js";
import { molecule } from "./molecule.js";

interface ConnTable {
  atoms: Atom[];
  bonds: Bond[];
}

/** A benzene ring: 6 carbons on a hexagon (Kekulé alternating bonds) with outward hydrogens. */
function benzene(): ConnTable {
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (90 + i * 60);
    atoms.push({ el: "C", x: Math.cos(a), y: -Math.sin(a) });
  }
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (90 + i * 60);
    atoms.push({ el: "H", x: 2 * Math.cos(a), y: -2 * Math.sin(a) });
  }
  for (let i = 0; i < 6; i++) bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1 });
  for (let i = 0; i < 6; i++) bonds.push({ a: i, b: 6 + i });
  return { atoms, bonds };
}

export const MOLECULE_LIBRARY: Readonly<Record<string, ConnTable>> = {
  hydrogen: {
    atoms: [
      { el: "H", x: -0.5, y: 0 },
      { el: "H", x: 0.5, y: 0 },
    ],
    bonds: [{ a: 0, b: 1 }],
  },
  oxygen: {
    atoms: [
      { el: "O", x: -0.6, y: 0 },
      { el: "O", x: 0.6, y: 0 },
    ],
    bonds: [{ a: 0, b: 1, order: 2 }],
  },
  nitrogen: {
    atoms: [
      { el: "N", x: -0.6, y: 0 },
      { el: "N", x: 0.6, y: 0 },
    ],
    bonds: [{ a: 0, b: 1, order: 3 }],
  },
  carbonMonoxide: {
    atoms: [
      { el: "C", x: -0.6, y: 0 },
      { el: "O", x: 0.6, y: 0 },
    ],
    bonds: [{ a: 0, b: 1, order: 3 }],
  },
  hydrogenChloride: {
    atoms: [
      { el: "H", x: -0.6, y: 0 },
      { el: "Cl", x: 0.6, y: 0 },
    ],
    bonds: [{ a: 0, b: 1 }],
  },
  water: {
    atoms: [
      { el: "O", x: 0, y: 0 },
      { el: "H", x: -0.82, y: 0.58 },
      { el: "H", x: 0.82, y: 0.58 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 0, b: 2 },
    ],
  },
  carbonDioxide: {
    atoms: [
      { el: "C", x: 0, y: 0 },
      { el: "O", x: -1.2, y: 0 },
      { el: "O", x: 1.2, y: 0 },
    ],
    bonds: [
      { a: 0, b: 1, order: 2 },
      { a: 0, b: 2, order: 2 },
    ],
  },
  ozone: {
    atoms: [
      { el: "O", x: 0, y: -0.4 },
      { el: "O", x: -1, y: 0.3 },
      { el: "O", x: 1, y: 0.3 },
    ],
    bonds: [
      { a: 0, b: 1, order: 2 },
      { a: 0, b: 2 },
    ],
  },
  sulfurDioxide: {
    atoms: [
      { el: "S", x: 0, y: -0.4 },
      { el: "O", x: -1, y: 0.3 },
      { el: "O", x: 1, y: 0.3 },
    ],
    bonds: [
      { a: 0, b: 1, order: 2 },
      { a: 0, b: 2, order: 2 },
    ],
  },
  ammonia: {
    atoms: [
      { el: "N", x: 0, y: 0 },
      { el: "H", x: 0, y: -1.0 },
      { el: "H", x: 0.9, y: 0.5 },
      { el: "H", x: -0.9, y: 0.5 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 0, b: 2 },
      { a: 0, b: 3 },
    ],
  },
  methane: {
    atoms: [
      { el: "C", x: 0, y: 0 },
      { el: "H", x: 0, y: -1.05 },
      { el: "H", x: 1.0, y: 0.5 },
      { el: "H", x: -1.0, y: 0.5 },
      { el: "H", x: 0, y: 1.05 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 0, b: 2 },
      { a: 0, b: 3 },
      { a: 0, b: 4 },
    ],
  },
  methanol: {
    atoms: [
      { el: "C", x: -0.7, y: 0 },
      { el: "O", x: 0.7, y: 0 },
      { el: "H", x: 1.4, y: 0.6 },
      { el: "H", x: -1.3, y: -0.8 },
      { el: "H", x: -1.3, y: 0.8 },
      { el: "H", x: -0.7, y: -1.0 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 0, b: 3 },
      { a: 0, b: 4 },
      { a: 0, b: 5 },
    ],
  },
  ethanol: {
    atoms: [
      { el: "C", x: -1.6, y: 0.3 },
      { el: "C", x: -0.5, y: -0.3 },
      { el: "O", x: 0.6, y: 0.3 },
      { el: "H", x: 1.5, y: -0.1 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 3 },
    ],
  },
  ethane: {
    atoms: [
      { el: "C", x: -0.7, y: 0 },
      { el: "C", x: 0.7, y: 0 },
      { el: "H", x: -1.4, y: -0.8 },
      { el: "H", x: -1.4, y: 0.8 },
      { el: "H", x: 1.4, y: -0.8 },
      { el: "H", x: 1.4, y: 0.8 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 0, b: 2 },
      { a: 0, b: 3 },
      { a: 1, b: 4 },
      { a: 1, b: 5 },
    ],
  },
  ethene: {
    atoms: [
      { el: "C", x: -0.65, y: 0 },
      { el: "C", x: 0.65, y: 0 },
      { el: "H", x: -1.4, y: -0.8 },
      { el: "H", x: -1.4, y: 0.8 },
      { el: "H", x: 1.4, y: -0.8 },
      { el: "H", x: 1.4, y: 0.8 },
    ],
    bonds: [
      { a: 0, b: 1, order: 2 },
      { a: 0, b: 2 },
      { a: 0, b: 3 },
      { a: 1, b: 4 },
      { a: 1, b: 5 },
    ],
  },
  ethyne: {
    atoms: [
      { el: "H", x: -1.7, y: 0 },
      { el: "C", x: -0.65, y: 0 },
      { el: "C", x: 0.65, y: 0 },
      { el: "H", x: 1.7, y: 0 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 1, b: 2, order: 3 },
      { a: 2, b: 3 },
    ],
  },
  aceticAcid: {
    atoms: [
      { el: "C", x: -1.4, y: 0.2 },
      { el: "C", x: -0.2, y: -0.3 },
      { el: "O", x: -0.2, y: -1.5 },
      { el: "O", x: 0.9, y: 0.3 },
      { el: "H", x: 1.8, y: -0.1 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 1, b: 2, order: 2 },
      { a: 1, b: 3 },
      { a: 3, b: 4 },
    ],
  },
  benzene: benzene(),
};

export type MoleculeName = keyof typeof MOLECULE_LIBRARY;

/** All molecule names in the library. */
export function moleculeNames(): string[] {
  return Object.keys(MOLECULE_LIBRARY);
}

export interface MoleculeFromOptions extends Omit<MoleculeOptions, "atoms" | "bonds"> {
  /** A library molecule name (see moleculeNames()). Unknown names render nothing. */
  name: string;
}

/** Render a curated library molecule by name (looks up its connection table → molecule()). */
export function moleculeFrom(opts: MoleculeFromOptions): GroupNode {
  const { name, ...rest } = opts;
  const entry = MOLECULE_LIBRARY[name];
  if (!entry) return { id: opts.id ?? "mol", type: "group", x: 0, y: 0, children: [] };
  return molecule({ ...rest, atoms: entry.atoms, bonds: entry.bonds });
}
