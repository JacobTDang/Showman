import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, chem } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";

const { lewisStructure } = chem;
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
const kids = (g: Node): Node[] => (g as GroupNode).children;
const text = (g: Node, id: string): string => (kids(g).find((n) => n.id === id) as { text?: string }).text ?? "";

describe("lewisStructure", () => {
  it("places a central atom, single bonds to ligands, and lone pairs (water)", () => {
    const w = lewisStructure({ id: "w", x: 130, y: 110, center: "O", ligands: [{ el: "H" }, { el: "H" }], centerLonePairs: 2 });
    expect(text(w, "w-center")).toBe("O");
    expect([text(w, "w-lig0"), text(w, "w-lig1")]).toEqual(["H", "H"]);
    expect(kids(w).filter((n) => /^w-b\d+-0$/.test(n.id))).toHaveLength(2); // one bond line per H (single)
    // 2 lone pairs on O → 4 dots (2 per pair).
    expect(kids(w).filter((n) => /^w-clp\d+-[ab]$/.test(n.id))).toHaveLength(4);
    expect(validateScene(scene([w]))).toMatchObject({ valid: true });
  });
  it("draws double bonds as two lines (CO2)", () => {
    const c = lewisStructure({
      id: "c",
      x: 130,
      y: 110,
      center: "C",
      ligands: [
        { el: "O", bonds: 2, lonePairs: 2 },
        { el: "O", bonds: 2, lonePairs: 2 },
      ],
    });
    expect(kids(c).filter((n) => /^c-b0-\d+$/.test(n.id))).toHaveLength(2); // double bond → 2 lines
    // lonePairs:2 on O → 2 pairs × 2 dots = 4 dot nodes on this ligand.
    expect(kids(c).filter((n) => /^c-lig0-lp\d+-[ab]$/.test(n.id))).toHaveLength(4);
    expect(validateScene(scene([c]))).toMatchObject({ valid: true });
  });
  it("draws triple bonds as three lines (C≡O)", () => {
    const t = lewisStructure({ id: "t", x: 130, y: 110, center: "C", ligands: [{ el: "O", bonds: 3, lonePairs: 1 }] });
    expect(kids(t).filter((n) => /^t-b0-\d+$/.test(n.id))).toHaveLength(3); // triple bond → 3 lines
    expect(validateScene(scene([t]))).toMatchObject({ valid: true });
  });
  it("shows a formal charge", () => {
    const ion = lewisStructure({
      id: "i",
      x: 100,
      y: 100,
      center: "N",
      ligands: [{ el: "H" }, { el: "H" }, { el: "H" }, { el: "H" }],
      charge: 1,
    });
    expect(text(ion, "i-charge")).toBe("+");
  });
});
