import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, physics } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode, PolylineNode } from "../../src/index.js";

const { lens, rayDiagram, snell } = physics;
const scene = (nodes: Node[]): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 800,
  height: 320,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes,
});
const kids = (g: Node): Node[] => (g as GroupNode).children;
const lastPt = (g: Node, id: string): { x: number; y: number } => {
  const p = kids(g).find((n) => n.id === id) as PolylineNode;
  return p.points[p.points.length - 1]!;
};

describe("lens", () => {
  it("is a vertical line with two arrowheads", () => {
    const l = lens({ id: "l", cx: 100, cy: 80, height: 120 });
    expect(kids(l).filter((n) => n.type === "polyline")).toHaveLength(3); // line + 2 heads
  });
});

describe("rayDiagram", () => {
  const base = { id: "rd", x: 20, y: 20, width: 480, height: 260, focalLength: 80 };
  it("forms a real, inverted image to the right when the object is beyond f", () => {
    const cx = base.x + base.width * 0.5;
    const cy = base.y + base.height * 0.5;
    const d = rayDiagram({ ...base, object: { distance: 170, height: 70 } });
    const tip = lastPt(d, "rd-parallel"); // all three rays converge here (the image tip)
    expect(tip.x).toBeGreaterThan(cx); // real image on the far side
    expect(tip.y).toBeGreaterThan(cy); // inverted (below the axis)
    expect(["rd-parallel", "rd-center", "rd-focal"].every((r) => kids(d).some((n) => n.id === r))).toBe(true);
    expect(validateScene(scene([d]))).toMatchObject({ valid: true });
  });
  it("forms a virtual image (dashed) on the same side when the object is within f", () => {
    const cx = base.x + base.width * 0.5;
    const d = rayDiagram({ ...base, object: { distance: 50, height: 60 } });
    const tip = lastPt(d, "rd-center");
    expect(tip.x).toBeLessThan(cx); // virtual image, same side as the object
    const ray = kids(d).find((n) => n.id === "rd-parallel") as { dash?: number[] };
    expect(Array.isArray(ray.dash)).toBe(true); // virtual rays are dashed
  });
});

describe("snell", () => {
  it("refracts toward the normal entering a denser medium, and reflects on TIR", () => {
    const refr = snell({ id: "s", x: 100, y: 80, n1: 1, n2: 1.5, incidentAngle: 40 });
    expect(kids(refr).some((n) => n.id === "s-out")).toBe(true); // a refracted ray exists
    expect(kids(refr).some((n) => n.id === "s-refl")).toBe(false);
    expect(validateScene(scene([refr]))).toMatchObject({ valid: true });
    // Past the critical angle (dense → rare), total internal reflection: no refracted ray, a reflected one.
    const tir = snell({ id: "t", x: 100, y: 80, n1: 1.5, n2: 1, incidentAngle: 65 });
    expect(kids(tir).some((n) => n.id === "t-out")).toBe(false);
    expect(kids(tir).some((n) => n.id === "t-refl")).toBe(true);
  });
});
