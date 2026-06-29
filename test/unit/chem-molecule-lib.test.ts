import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, chem } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";

const { moleculeFrom, moleculeNames, MOLECULE_LIBRARY } = chem;
const scene = (nodes: Node[]): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 400,
  height: 300,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes,
});

describe("molecule library", () => {
  it("offers a set of named molecules and renders each one validly", () => {
    const names = moleculeNames();
    expect(names.length).toBeGreaterThanOrEqual(15);
    expect(names).toEqual(expect.arrayContaining(["water", "benzene", "ethanol", "ammonia"]));
    for (const name of names) {
      const m = moleculeFrom({ id: "m", name, ox: 150, oy: 120, scale: 36, shadow: false });
      expect(validateScene(scene([m]))).toMatchObject({ valid: true }); // every library entry is renderable
    }
  });
  it("renders nothing for an unknown name", () => {
    const m = moleculeFrom({ name: "unobtainium" }) as GroupNode;
    expect(m.type).toBe("group");
    expect(m.children).toHaveLength(0);
  });
  it("benzene is a 6-carbon ring with alternating bonds + outward hydrogens", () => {
    const b = MOLECULE_LIBRARY.benzene!;
    expect(b.atoms.filter((a) => a.el === "C")).toHaveLength(6);
    expect(b.atoms.filter((a) => a.el === "H")).toHaveLength(6);
    const ring = b.bonds.slice(0, 6); // the 6 ring bonds
    expect(ring.map((bd) => bd.order ?? 1)).toEqual([2, 1, 2, 1, 2, 1]); // Kekulé alternation
  });
  it("orders diatomic bonds correctly (O=O double, N≡N triple)", () => {
    expect(MOLECULE_LIBRARY.oxygen!.bonds[0]!.order).toBe(2);
    expect(MOLECULE_LIBRARY.nitrogen!.bonds[0]!.order).toBe(3);
  });
  it("renders deterministically", () => {
    const s = scene([moleculeFrom({ id: "m", name: "ethanol", ox: 120, oy: 110, scale: 40, shadow: false })]);
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 0).pixels))).toBe(true);
  });
});
