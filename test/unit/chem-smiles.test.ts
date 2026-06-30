import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, chem } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";

const { parseSmiles, smilesToMolecule, moleculeFromSmiles } = chem;
const scene = (n: Node): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 360,
  height: 300,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes: [n],
});

describe("parseSmiles", () => {
  it("parses chains, branches, multi-letter atoms, and bond orders", () => {
    expect(parseSmiles("CCO").atoms.map((a) => a.el)).toEqual(["C", "C", "O"]);
    const acid = parseSmiles("CC(=O)O");
    expect(acid.atoms.map((a) => a.el)).toEqual(["C", "C", "O", "O"]);
    expect(acid.bonds.find((b) => b.a === 1 && b.b === 2)!.order).toBe(2); // the C=O
    expect(parseSmiles("C#N").bonds[0]!.order).toBe(3); // triple
    expect(parseSmiles("CBr").atoms.map((a) => a.el)).toEqual(["C", "Br"]); // two-letter halogen
    expect(parseSmiles("[NH4]").atoms[0]!.el).toBe("N"); // bracket element
  });
  it("closes rings (benzene = 6 atoms, 6 bonds, one ring bond)", () => {
    const b = parseSmiles("c1ccccc1");
    expect(b.atoms).toHaveLength(6);
    expect(b.bonds).toHaveLength(6);
    expect(b.bonds.filter((bd) => bd.ring)).toHaveLength(1); // the closure bond
    expect(b.atoms.every((a) => a.aromatic)).toBe(true);
  });
  it("breaks bonds across a '.' fragment separator (review fix)", () => {
    const m = parseSmiles("CCO.O"); // ethanol + a separate water O — NOT one chain
    expect(m.atoms.map((a) => a.el)).toEqual(["C", "C", "O", "O"]);
    expect(m.bonds).toHaveLength(2); // C-C, C-O — the last O is disconnected, no spurious O-O
    expect(m.bonds.some((b) => b.a === 3 || b.b === 3)).toBe(false);
  });
  it("never makes a zero-length self-bond when a ring digit repeats on one atom (review fix)", () => {
    const m = parseSmiles("C11"); // degenerate: digit opened and closed on the same atom
    expect(m.bonds.every((b) => b.a !== b.b)).toBe(true);
  });
});

describe("smilesToMolecule", () => {
  it("Kekulizes an aromatic ring (alternating bond orders) with finite coordinates", () => {
    const m = smilesToMolecule("c1ccccc1");
    expect(m.atoms.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y))).toBe(true);
    const orders = m.bonds.map((b) => b.order).sort();
    expect(orders).toEqual([1, 1, 1, 2, 2, 2]); // 3 single + 3 double around the ring
  });
  it("lays a ring out as a polygon (all atoms ≈ one radius from their centroid)", () => {
    const m = smilesToMolecule("c1ccccc1");
    const cx = m.atoms.reduce((s, a) => s + a.x, 0) / 6;
    const cy = m.atoms.reduce((s, a) => s + a.y, 0) / 6;
    const radii = m.atoms.map((a) => Math.hypot(a.x - cx, a.y - cy));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.1); // a regular hexagon
  });
});

describe("moleculeFromSmiles", () => {
  it("renders a range of molecules validly", () => {
    for (const smiles of ["CCO", "CC(=O)O", "c1ccccc1", "Cc1ccccc1", "CC(C)C", "C#N", "OCC(O)CO"]) {
      const m = moleculeFromSmiles({ id: "m", smiles, ox: 180, oy: 150, scale: 34, shadow: false });
      expect(validateScene(scene(m))).toMatchObject({ valid: true });
    }
  });
  it("stays valid for small and fused rings (review fix)", () => {
    for (const smiles of ["C1CC1", "C1C1", "c1ccc2ccccc2c1"]) {
      const m = moleculeFromSmiles({ id: "m", smiles, ox: 180, oy: 150, scale: 30, shadow: false });
      expect(validateScene(scene(m))).toMatchObject({ valid: true });
    }
  });
  it("returns an empty group for an empty/garbage string and renders deterministically", () => {
    expect((moleculeFromSmiles({ smiles: "" }) as GroupNode).children).toHaveLength(0);
    const s = scene(moleculeFromSmiles({ id: "m", smiles: "CCO", ox: 150, oy: 120, scale: 36, shadow: false }));
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 0).pixels))).toBe(true);
  });
});
