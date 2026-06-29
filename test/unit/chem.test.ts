import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, chem } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";
import { samplePixel } from "../helpers.js";

const { chemEquation, molecule, reaction, cpkColor, MOLECULE_PRESETS } = chem;
function scene(nodes: Node[], w = 400, h = 300): SceneSpec {
  return { specVersion: SPEC_VERSION, width: w, height: h, fps: 1, duration: 1, seed: 1, background: "#ffffff", nodes };
}
const kids = (g: GroupNode): Node[] => g.children;

describe("CPK colors", () => {
  it("maps common elements and falls back for unknowns", () => {
    expect(cpkColor("O")).toBe("#ff2d2d");
    expect(cpkColor("H")).toBe("#f8fafc");
    expect(cpkColor("C")).toBe("#2b2b2b");
    expect(cpkColor("Xx")).toBe("#ff80c0"); // default
  });
});

describe("chemEquation (mhchem)", () => {
  it("typesets a formula into glyph paths and validates", () => {
    const eq = chemEquation({ id: "e", formula: "2H2 + O2 -> 2H2O", x: 10, y: 10, size: 30 });
    expect(eq.width).toBeGreaterThan(0);
    expect(kids(eq.node).length).toBeGreaterThan(5); // many glyph + bar paths
    expect(validateScene(scene([eq.node]))).toMatchObject({ valid: true });
  });
});

describe("molecule", () => {
  it("builds CPK atoms + bonds for water and validates", () => {
    const m = molecule({ id: "w", ...MOLECULE_PRESETS.water, ox: 80, oy: 80, scale: 50 });
    const atoms = kids(m).filter((n) => n.type === "ellipse");
    const bonds = kids(m).filter((n) => n.type === "polyline");
    expect(atoms).toHaveLength(3); // O + 2H
    expect(bonds).toHaveLength(2); // 2 single bonds
    expect((atoms[0] as { fill?: string }).fill).toBe("#ff2d2d"); // O is red
    expect(validateScene(scene([m]))).toMatchObject({ valid: true });
  });

  it("draws a double bond as two parallel lines (CO2)", () => {
    const m = molecule({ id: "c", ...MOLECULE_PRESETS.carbonDioxide, ox: 100, oy: 60, scale: 44 });
    expect(kids(m).filter((n) => n.type === "polyline")).toHaveLength(4); // 2 double bonds × 2 lines
    const r = renderFrame(scene([m]), 0);
    let inked = false;
    for (let x = 40; x < 200 && !inked; x++)
      if (samplePixel(r, x, 60).r + samplePixel(r, x, 60).g + samplePixel(r, x, 60).b < 600) inked = true;
    expect(inked).toBe(true);
  });

  it("adds pop-in tracks when animated", () => {
    const m = molecule({ id: "w", ...MOLECULE_PRESETS.water, animate: true });
    const atom = kids(m).find((n) => n.type === "ellipse") as { tracks?: unknown[] };
    expect(Array.isArray(atom.tracks)).toBe(true);
  });
});

describe("reaction", () => {
  it("lays out reactants, an arrow, and products; validates", () => {
    const rx = reaction({ id: "rx", reactants: ["2H2", "O2"], products: ["2H2O"], conditions: "spark", x: 10, y: 20, size: 32 });
    const ids = kids(rx).map((n) => n.id);
    expect(ids.some((i) => i.includes("-r0"))).toBe(true); // first reactant
    expect(ids.some((i) => i.includes("-p0"))).toBe(true); // first product
    expect(ids.some((i) => i.includes("-plus-"))).toBe(true); // the "+" between 2H2 and O2
    expect(ids.some((i) => i.includes("-arrow"))).toBe(true);
    expect(validateScene(scene([rx], 520, 120))).toMatchObject({ valid: true });
  });

  it("sweeps the arrow on when animated (progress track on the line)", () => {
    const rx = reaction({ id: "rx", reactants: ["A"], products: ["B"], x: 0, y: 0, animateArrow: true });
    const arrow = kids(rx).find((n) => n.id.endsWith("-arrow")) as GroupNode;
    const line = arrow.children.find((c) => c.id.endsWith("-line")) as { tracks?: { property: string }[] };
    expect(line.tracks?.[0]?.property).toBe("progress");
  });

  it("renders deterministically", () => {
    const s = scene([reaction({ reactants: ["CH4", "2O2"], products: ["CO2", "2H2O"], x: 10, y: 30, size: 28 })], 600, 100);
    const a = renderFrame(s, 0);
    const b = renderFrame(s, 0);
    expect(Buffer.from(a.pixels).equals(Buffer.from(b.pixels))).toBe(true);
  });
});
