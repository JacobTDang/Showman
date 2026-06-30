/**
 * SMILES → molecule (Phase 2 of the molecule layout work). A SMILES-lite parser (organic subset,
 * = / # bonds, branches, ring-closure digits, simple [bracket] atoms) builds a heavy-atom connection
 * table, and a 2D layout pass places the atoms (a regular polygon for a ring; a zig-zag for chains +
 * outward/fanned substituents) so any common molecule renders from a string via the existing
 * molecule() renderer. Pure + deterministic. Skeletal (implicit hydrogens are not drawn).
 */

import type { GroupNode } from "../spec/types.js";
import type { Atom, Bond, MoleculeOptions } from "./molecule.js";
import { molecule } from "./molecule.js";

interface PAtom {
  el: string;
  aromatic: boolean;
}
interface PBond {
  a: number;
  b: number;
  order: number;
  ring: boolean;
}
interface Point {
  x: number;
  y: number;
}

function bracketElement(inner: string): string {
  const m = inner.match(/^([A-Z][a-z]?)/);
  return m ? m[1]! : "C";
}

/** Parse a SMILES-lite string into a heavy-atom connection table. */
export function parseSmiles(s: string): { atoms: PAtom[]; bonds: PBond[] } {
  const atoms: PAtom[] = [];
  const bonds: PBond[] = [];
  const stack: number[] = [];
  const rings = new Map<string, { atom: number; order: number }>();
  let prev = -1;
  let pending = 0; // 0 = default bond
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "(") {
      stack.push(prev);
      i++;
    } else if (c === ".") {
      prev = -1; // fragment break: the next atom starts a disconnected piece, not a bond to the last
      pending = 0;
      i++;
    } else if (c === ")") {
      prev = stack.length ? stack.pop()! : prev;
      i++;
    } else if (c === "-") {
      pending = 1;
      i++;
    } else if (c === "=") {
      pending = 2;
      i++;
    } else if (c === "#") {
      pending = 3;
      i++;
    } else if (c === ":") {
      pending = 1;
      i++;
    } else if (c >= "0" && c <= "9") {
      const r = rings.get(c);
      if (r) {
        if (prev >= 0 && prev !== r.atom) bonds.push({ a: r.atom, b: prev, order: r.order || pending || 1, ring: true });
        rings.delete(c);
      } else if (prev >= 0) {
        rings.set(c, { atom: prev, order: pending });
      }
      pending = 0;
      i++;
    } else {
      let el: string | null = null;
      let aromatic = false;
      if (c === "[") {
        const close = s.indexOf("]", i);
        if (close < 0) break;
        el = bracketElement(s.slice(i + 1, close));
        i = close + 1;
      } else if (c === "C" && s[i + 1] === "l") {
        el = "Cl";
        i += 2;
      } else if (c === "B" && s[i + 1] === "r") {
        el = "Br";
        i += 2;
      } else if ("BCNOPSFI".includes(c)) {
        el = c;
        i++;
      } else if ("bcnops".includes(c)) {
        el = c.toUpperCase();
        aromatic = true;
        i++;
      } else {
        i++; // skip stray chars (/, \, @, +, -, H inside fragments we don't model)
        continue;
      }
      const idx = atoms.length;
      atoms.push({ el, aromatic });
      if (prev >= 0) bonds.push({ a: prev, b: idx, order: pending || 1, ring: false });
      pending = 0;
      prev = idx;
    }
  }
  return { atoms, bonds };
}

/** Shortest path between two atoms over the given (tree) bonds, inclusive of both ends. */
function bfsPath(from: number, to: number, edges: PBond[], n: number): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) {
    adj[e.a]!.push(e.b);
    adj[e.b]!.push(e.a);
  }
  const prev = new Array<number>(n).fill(-1);
  const seen = new Array<boolean>(n).fill(false);
  const q = [from];
  seen[from] = true;
  while (q.length) {
    const u = q.shift()!;
    if (u === to) break;
    for (const v of adj[u]!) {
      if (!seen[v]) {
        seen[v] = true;
        prev[v] = u;
        q.push(v);
      }
    }
  }
  const path: number[] = [];
  for (let at = to; at >= 0; at = prev[at]!) {
    path.push(at);
    if (at === from) break;
  }
  return path.reverse();
}

const DEG = Math.PI / 180;
const rotate = (p: Point, a: number): Point => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

/** Lay out the connection table in 2D: a regular polygon for the first ring, zig-zag chains + fanned
 * substituents otherwise. Returns one coordinate per atom (bond length ≈ 1 unit). */
function layout(atoms: PAtom[], bonds: PBond[]): Point[] {
  const n = atoms.length;
  const coords: (Point | null)[] = new Array(n).fill(null);
  const incoming: (Point | null)[] = new Array(n).fill(null);
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const b of bonds) {
    adj[b.a]!.push(b.b);
    adj[b.b]!.push(b.a);
  }
  const placed = new Set<number>();
  const ringBond = bonds.find((b) => b.ring);
  let ringSet = new Set<number>();
  const ringCenter: Point = { x: 0, y: 0 };

  if (ringBond) {
    const tree = bonds.filter((b) => !b.ring);
    const cycle = bfsPath(ringBond.a, ringBond.b, tree, n);
    const m = Math.max(3, cycle.length);
    const R = 0.5 / Math.sin(Math.PI / m);
    cycle.forEach((idx, k) => {
      const a = (Math.PI * 2 * k) / m - Math.PI / 2;
      coords[idx] = { x: R * Math.cos(a), y: R * Math.sin(a) };
      placed.add(idx);
    });
    ringSet = new Set(cycle);
  } else if (n > 0) {
    coords[0] = { x: 0, y: 0 };
    incoming[0] = { x: 1, y: 0 };
    placed.add(0);
  }

  const queue = [...placed];
  let guard = 0;
  while (queue.length && guard++ < n * 4) {
    const p = queue.shift()!;
    let sub = 0;
    for (const c of adj[p]!) {
      if (placed.has(c)) continue;
      let dir: Point;
      if (ringSet.has(p)) {
        // Substituent off a ring atom: point outward from the ring centre (fan extras).
        const ox = coords[p]!.x - ringCenter.x;
        const oy = coords[p]!.y - ringCenter.y;
        const l = Math.hypot(ox, oy) || 1;
        dir = rotate({ x: ox / l, y: oy / l }, sub * 35 * DEG);
      } else {
        // Chain: zig-zag — turn the incoming direction by ±60°, alternating; fan extra branches.
        const din = incoming[p] ?? { x: 1, y: 0 };
        const sign = sub % 2 === 0 ? 1 : -1;
        const mag = 60 + Math.floor(sub / 2) * 30;
        dir = rotate(din, sign * mag * DEG);
      }
      coords[c] = { x: coords[p]!.x + dir.x, y: coords[p]!.y + dir.y };
      incoming[c] = dir;
      placed.add(c);
      queue.push(c);
      sub++;
    }
  }
  // Any disconnected leftovers get a fallback slot so no coordinate is null.
  let fb = 0;
  for (let k = 0; k < n; k++) if (!coords[k]) coords[k] = { x: (fb++ + 1) * 1.5, y: 2 };
  return coords as Point[];
}

/** Kekulé alternation: if a ring is fully aromatic, alternate its bond orders 2,1,2,1… */
function kekulize(atoms: PAtom[], bonds: PBond[]): void {
  const ringBond = bonds.find((b) => b.ring);
  if (!ringBond) return;
  const tree = bonds.filter((b) => !b.ring);
  const cycle = bfsPath(ringBond.a, ringBond.b, tree, atoms.length);
  if (!cycle.every((idx) => atoms[idx]!.aromatic)) return;
  const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const ringEdges = new Set<string>();
  for (let k = 0; k < cycle.length; k++) ringEdges.add(edgeKey(cycle[k]!, cycle[(k + 1) % cycle.length]!));
  let toggle = true;
  for (const b of bonds) {
    if (ringEdges.has(edgeKey(b.a, b.b))) {
      b.order = toggle ? 2 : 1;
      toggle = !toggle;
    }
  }
}

/** Parse + lay out a SMILES string into the molecule() connection-table format. */
export function smilesToMolecule(smiles: string): { atoms: Atom[]; bonds: Bond[] } {
  const { atoms, bonds } = parseSmiles(smiles);
  kekulize(atoms, bonds);
  const coords = layout(atoms, bonds);
  return {
    atoms: atoms.map((a, i) => ({ el: a.el, x: coords[i]!.x, y: coords[i]!.y })),
    bonds: bonds.map((b) => ({ a: b.a, b: b.b, order: Math.min(3, Math.max(1, b.order)) as 1 | 2 | 3 })),
  };
}

export interface MoleculeFromSmilesOptions extends Omit<MoleculeOptions, "atoms" | "bonds"> {
  smiles: string;
}

/** Render a molecule from a SMILES string (parse → 2D layout → molecule()). */
export function moleculeFromSmiles(opts: MoleculeFromSmilesOptions): GroupNode {
  const { smiles, ...rest } = opts;
  const ct = smilesToMolecule(smiles);
  if (ct.atoms.length === 0) return { id: opts.id ?? "mol", type: "group", x: 0, y: 0, children: [] };
  return molecule({ ...rest, atoms: ct.atoms, bonds: ct.bonds });
}
