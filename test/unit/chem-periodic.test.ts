import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, chem } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";

const { periodicTable, ELEMENTS } = chem;
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("element data", () => {
  it("has all 118 elements with unique, complete atomic numbers + symbols", () => {
    expect(ELEMENTS).toHaveLength(118);
    const zs = ELEMENTS.map((e) => e.z).sort((a, b) => a - b);
    expect(zs[0]).toBe(1);
    expect(zs[117]).toBe(118);
    expect(new Set(zs).size).toBe(118); // no duplicate Z
    expect(new Set(ELEMENTS.map((e) => e.sym)).size).toBe(118); // no duplicate symbols
    for (const e of ELEMENTS) {
      expect(e.group).toBeGreaterThanOrEqual(1);
      expect(e.group).toBeLessThanOrEqual(18);
      expect(e.period).toBeGreaterThanOrEqual(1);
      expect(e.period).toBeLessThanOrEqual(9);
    }
  });
});

describe("periodicTable", () => {
  it("renders a cell + symbol per element and validates", () => {
    const pt = periodicTable({ id: "pt", x: 10, y: 10, cellSize: 40 });
    expect(kids(pt).filter((n) => /^pt-c\d+$/.test(n.id))).toHaveLength(118);
    expect((kids(pt).find((n) => n.id === "pt-s8") as { text?: string }).text).toBe("O"); // Z=8 → oxygen
    const spec: SceneSpec = {
      specVersion: SPEC_VERSION,
      width: 760,
      height: 440,
      fps: 1,
      duration: 1,
      seed: 1,
      background: "#fff",
      nodes: [pt],
    };
    expect(validateScene(spec)).toMatchObject({ valid: true });
  });
  it("rings highlighted elements and dims the rest", () => {
    const pt = periodicTable({ id: "pt", x: 0, y: 0, highlight: ["O", "Na"] });
    const o = kids(pt).find((n) => n.id === "pt-c8") as { stroke?: string; opacity?: number }; // oxygen cell
    const he = kids(pt).find((n) => n.id === "pt-c2") as { stroke?: string; opacity?: number }; // helium (not highlighted)
    expect(o.stroke).toBeDefined(); // accent ring
    expect(he.opacity).toBeLessThan(1); // dimmed
  });
});
