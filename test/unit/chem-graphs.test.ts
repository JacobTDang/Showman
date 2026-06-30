import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, chem } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode, PolylineNode, Track } from "../../src/index.js";

const { energyDiagram, phScale, reaction, molecule, MOLECULE_PRESETS } = chem;
const scene = (nodes: Node[]): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 600,
  height: 480,
  fps: 12,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes,
});
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("energyDiagram", () => {
  const opts = { id: "ed", x: 40, y: 20, width: 400, height: 280, reactantsLevel: 30, productsLevel: 12, activationPeak: 78 };
  it("draws a curve whose peak sits above both endpoints, with Ea + ΔH markers", () => {
    const d = energyDiagram(opts);
    const curve = kids(d).find((n) => n.id === "ed-curve") as PolylineNode;
    const ys = curve.points.map((p) => p.y);
    // Local y grows downward → the activation peak is the MIN y, above both ends.
    expect(Math.min(...ys)).toBeLessThan(curve.points[0]!.y);
    expect(Math.min(...ys)).toBeLessThan(curve.points[curve.points.length - 1]!.y);
    expect(kids(d).some((n) => n.id === "ed-ea")).toBe(true); // activation-energy marker
    expect(kids(d).some((n) => n.id === "ed-dh")).toBe(true); // ΔH marker
    expect(validateScene(scene([d]))).toMatchObject({ valid: true });
  });
  it("adds a dashed catalyst curve and a draw-on when asked", () => {
    const d = energyDiagram({ ...opts, catalystPeak: 55, animate: true });
    const cat = kids(d).find((n) => n.id === "ed-cat") as { dash?: number[] };
    expect(Array.isArray(cat.dash)).toBe(true);
    const curve = kids(d).find((n) => n.id === "ed-curve") as { tracks?: Track[] };
    expect(curve.tracks!.some((t) => t.property === "progress")).toBe(true);
  });
});

describe("phScale", () => {
  it("draws a gradient bar, 0–14 ticks, and a pointer at the value", () => {
    const p = phScale({ id: "ph", x: 0, y: 0, width: 280, value: 3, label: "lemon" });
    const bar = kids(p).find((n) => n.id === "ph-bar") as { gradient?: unknown };
    expect(bar.gradient).toBeDefined();
    expect(kids(p).filter((n) => /-t\d+$/.test(n.id))).toHaveLength(15); // 0..14
    expect(kids(p).some((n) => n.id === "ph-ptr")).toBe(true);
    expect(validateScene(scene([p]))).toMatchObject({ valid: true });
  });
  it("omits the pointer when no value is given", () => {
    expect(kids(phScale({ id: "ph", x: 0, y: 0 })).some((n) => n.id === "ph-ptr")).toBe(false);
  });
  it("clamps an out-of-range value to the bar edges", () => {
    const ptrX = (value: number): number =>
      (kids(phScale({ id: "ph", x: 0, y: 0, width: 280, value })).find((n) => n.id === "ph-ptr") as { x: number }).x;
    expect(ptrX(20)).toBe(280); // pH > 14 pins to the right edge (x + w)
    expect(ptrX(-3)).toBe(0); //  pH < 0 pins to the left edge (x)
  });
  it("omits the pointer for a non-finite value (determinism guard)", () => {
    expect(kids(phScale({ id: "ph", x: 0, y: 0, width: 280, value: NaN })).some((n) => n.id === "ph-ptr")).toBe(false);
  });
});

describe("reaction conditions placement (fix)", () => {
  it("places the condition label as its own node above the arrow, not on the line", () => {
    const r = reaction({ id: "rxn", reactants: ["2H2", "O2"], products: ["2H2O"], x: 20, y: 80, size: 26, conditions: "spark" });
    const cond = kids(r).find((n) => n.id === "rxn-cond") as { type: string; text?: string; y: number };
    expect(cond.type).toBe("text");
    expect(cond.text).toBe("spark");
    const arrow = kids(r).find((n) => n.id === "rxn-arrow") as GroupNode;
    // The connector no longer carries the condition as a label.
    const arrowTexts = arrow.children.filter((c) => c.type === "text").map((c) => (c as { text?: string }).text);
    expect(arrowTexts).not.toContain("spark");
  });
});

describe("molecule golden-safe shadow (fix)", () => {
  const atom = (m: Node): { shadow?: unknown } =>
    kids(m).find((n) => n.type === "ellipse" && (n as { gradient?: unknown }).gradient !== undefined) as { shadow?: unknown };
  it("drops the (non-deterministic) blur shadow when shadow:false", () => {
    expect(atom(molecule({ id: "m", ...MOLECULE_PRESETS.water, shadow: false })).shadow).toBeUndefined();
    expect(atom(molecule({ id: "m", ...MOLECULE_PRESETS.water })).shadow).toBeDefined(); // default keeps it
  });
});
