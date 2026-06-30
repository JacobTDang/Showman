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
  it("flips the arrowhead direction between converging and diverging", () => {
    const top = 80 - 120 / 2; // head id is keyed on the top-vertex y (= cy − h/2)
    const headPts = (g: Node, id: string): { x: number; y: number }[] => (kids(g).find((n) => n.id === id) as PolylineNode).points;
    const conv = headPts(lens({ id: "c", cx: 100, cy: 80, height: 120, type: "converging" }), `c-h${top}`);
    const div = headPts(lens({ id: "d", cx: 100, cy: 80, height: 120, type: "diverging" }), `d-h${top}`);
    // converging: top head opens outward (wings below the vertex); diverging: wings above → sign flips.
    expect(Math.sign(conv[0]!.y - conv[1]!.y)).toBe(-Math.sign(div[0]!.y - div[1]!.y));
  });
});

describe("rayDiagram", () => {
  const base = { id: "rd", x: 20, y: 20, width: 480, height: 260, focalLength: 80 };
  it("forms a real, inverted image to the right when the object is beyond f", () => {
    const cx = base.x + base.width * 0.5;
    const cy = base.y + base.height * 0.5;
    const d = rayDiagram({ ...base, object: { distance: 170, height: 70 } });
    const tip = lastPt(d, "rd-parallel"); // all three rays converge here (the image tip)
    // Thin-lens equation: di = f·do/(do−f) = 80·170/90 ≈ 151.11, placed at cx + di.
    const di = (base.focalLength * 170) / (170 - base.focalLength);
    expect(tip.x).toBeCloseTo(cx + di, 5); // image at the lens-equation distance (≈ 411.11)
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
    const incident = 40;
    const refr = snell({ id: "s", x: 100, y: 80, n1: 1, n2: 1.5, incidentAngle: incident });
    expect(kids(refr).some((n) => n.id === "s-out")).toBe(true); // a refracted ray exists
    expect(kids(refr).some((n) => n.id === "s-refl")).toBe(false);
    // The refracted ray leaves the origin (100,80); its angle from the vertical normal < the incident angle.
    const outGroup = kids(refr).find((n) => n.id === "s-out") as GroupNode;
    const line = outGroup.children.find((n) => n.id === "s-out-line") as PolylineNode;
    const end = line.points[line.points.length - 1]!;
    const refrAngle = Math.atan2(Math.abs(end.x - 100), Math.abs(end.y - 80));
    expect(refrAngle).toBeLessThan((incident * Math.PI) / 180); // bent toward the normal (denser medium)
    expect(refrAngle).toBeCloseTo(Math.asin((1 / 1.5) * Math.sin((incident * Math.PI) / 180)), 6); // Snell's law
    expect(validateScene(scene([refr]))).toMatchObject({ valid: true });
    // Past the critical angle (dense → rare), total internal reflection: no refracted ray, a reflected one.
    const tir = snell({ id: "t", x: 100, y: 80, n1: 1.5, n2: 1, incidentAngle: 65 });
    expect(kids(tir).some((n) => n.id === "t-out")).toBe(false);
    expect(kids(tir).some((n) => n.id === "t-refl")).toBe(true);
  });
});
