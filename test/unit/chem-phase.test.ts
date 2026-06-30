import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, chem } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode, PolylineNode } from "../../src/index.js";

const { titrationCurve, heatingCurve, phaseDiagram } = chem;
const scene = (nodes: Node[]): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 520,
  height: 420,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes,
});
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("titrationCurve", () => {
  it("rises through an equivalence point and validates", () => {
    const t = titrationCurve({
      id: "t",
      x: 40,
      y: 20,
      width: 360,
      height: 280,
      equivalenceVolume: 25,
      maxVolume: 50,
      startPh: 1,
      endPh: 13,
    });
    const curve = kids(t).find((n) => n.id === "t-curve") as PolylineNode;
    // Local y grows downward → low pH (start) is high y, high pH (end) is low y: the curve climbs.
    expect(curve.points[curve.points.length - 1]!.y).toBeLessThan(curve.points[0]!.y);
    expect(kids(t).some((n) => n.id === "t-eq")).toBe(true); // equivalence marker
    expect(validateScene(scene([t]))).toMatchObject({ valid: true });
  });
  it("draws the curve on with a progress track when animated", () => {
    const t = titrationCurve({ id: "t", x: 40, y: 20, width: 360, height: 280, animate: true });
    const curve = kids(t).find((n) => n.id === "t-curve") as { tracks?: { property: string }[] };
    expect(curve.tracks!.some((tr) => tr.property === "progress")).toBe(true);
  });
});

describe("heatingCurve", () => {
  it("has flat melting + boiling plateaus", () => {
    const c = heatingCurve({ id: "h", x: 40, y: 20, width: 360, height: 280, meltTemp: 0, boilTemp: 100 });
    const curve = kids(c).find((n) => n.id === "h-curve") as PolylineNode;
    expect(curve.points).toHaveLength(6); // 5 segments
    expect(curve.points[1]!.y).toBeCloseTo(curve.points[2]!.y, 5); // melting plateau (flat)
    expect(curve.points[3]!.y).toBeCloseTo(curve.points[4]!.y, 5); // boiling plateau (flat)
    expect(validateScene(scene([c]))).toMatchObject({ valid: true });
  });
  it("draws the curve on with a progress track when animated", () => {
    const c = heatingCurve({ id: "h", x: 40, y: 20, width: 360, height: 280, animate: true });
    const curve = kids(c).find((n) => n.id === "h-curve") as { tracks?: { property: string }[] };
    expect(curve.tracks!.some((tr) => tr.property === "progress")).toBe(true);
  });
});

describe("phaseDiagram", () => {
  it("draws three phase boundaries, the triple + critical points, and region labels", () => {
    const p = phaseDiagram({ id: "p", x: 40, y: 20, width: 360, height: 280 });
    for (const b of ["p-sub", "p-fus", "p-vap", "p-tp", "p-cp"]) expect(kids(p).some((n) => n.id === b)).toBe(true);
    const labels = kids(p)
      .filter((n) => n.type === "text")
      .map((n) => (n as { text?: string }).text);
    expect(labels).toEqual(expect.arrayContaining(["Solid", "Liquid", "Gas"]));
    expect(validateScene(scene([p]))).toMatchObject({ valid: true });
  });
});
