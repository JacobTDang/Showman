import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, physics } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";

const { forceDiagram, resistor, battery, capacitor, lamp, ground, wire } = physics;
function scene(nodes: Node[], w = 400, h = 300): SceneSpec {
  return { specVersion: SPEC_VERSION, width: w, height: h, fps: 1, duration: 1, seed: 1, background: "#ffffff", nodes };
}
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("forceDiagram", () => {
  const opts = {
    id: "fd",
    x: 150,
    y: 120,
    forces: [
      { label: "F", magnitude: 60, angle: 0 },
      { label: "N", magnitude: 50, angle: 90 },
    ],
    bodyLabel: "m",
  };
  it("draws an arrow + label per force and a central body; validates", () => {
    const d = forceDiagram(opts);
    expect(kids(d).filter((n) => /-f\d+$/.test(n.id))).toHaveLength(2); // a connector group per force
    expect(kids(d).some((n) => n.id === "fd-body")).toBe(true);
    expect(kids(d).some((n) => n.id === "fd-lbl-0")).toBe(true);
    expect(validateScene(scene([d]))).toMatchObject({ valid: true });
  });
  it("points an angle-0 force to the right and draws components/animation when asked", () => {
    const d = forceDiagram({ ...opts, showComponents: true, animate: true });
    const lbl = kids(d).find((n) => n.id === "fd-lbl-0") as { x: number };
    expect(lbl.x).toBeGreaterThan(opts.x); // 0° points +x
    expect(kids(d).some((n) => n.id === "fd-cx-0")).toBe(true); // x component
    const arrow = kids(d).find((n) => n.id === "fd-f0") as GroupNode;
    const line = arrow.children.find((c) => c.id.endsWith("-line")) as { tracks?: { property: string }[] };
    expect(line.tracks?.[0]?.property).toBe("progress"); // grows on
  });
  it("draws a small force (magnitude < bodyRadius) outward, not reversed into the body (review fix)", () => {
    const d = forceDiagram({ id: "fd", x: 100, y: 100, bodyRadius: 16, forces: [{ label: "n", magnitude: 5, angle: 0 }] });
    const lbl = kids(d).find((n) => n.id === "fd-lbl-0") as { x: number };
    expect(lbl.x).toBeGreaterThan(100 + 16); // tip is beyond the body edge (length not reversed)
  });
});

describe("circuit symbols", () => {
  it("expose left/right terminals at the expected coords", () => {
    const r = resistor({ x: 20, y: 50, size: 70 });
    expect(r.a).toEqual({ x: 20, y: 50 });
    expect(r.b).toEqual({ x: 90, y: 50 });
  });
  it("each symbol builds a valid group", () => {
    for (const sym of [resistor, battery, capacitor, lamp]) {
      const s = sym({ x: 20, y: 60, label: "X" });
      expect(validateScene(scene([s.node]))).toMatchObject({ valid: true });
    }
    expect(validateScene(scene([ground({ x: 40, y: 40 }).node]))).toMatchObject({ valid: true });
  });
  it("a lamp has a bulb circle and an X filament", () => {
    const l = lamp({ x: 0, y: 40, size: 70 });
    expect(kids(l.node).some((n) => n.type === "ellipse")).toBe(true);
    expect(kids(l.node).filter((n) => n.id.includes("-x"))).toHaveLength(2);
  });
});

describe("wire", () => {
  it("draws current as an animated dash when asked", () => {
    const w = wire({
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      current: true,
    }) as { dash?: number[]; tracks?: { property: string }[] };
    expect(Array.isArray(w.dash)).toBe(true);
    expect(w.tracks?.[0]?.property).toBe("dashOffset");
  });
  it("renders a circuit deterministically", () => {
    const b = battery({ id: "b", x: 20, y: 80 });
    const r = resistor({ id: "r", x: 120, y: 80 });
    const s = scene([wire({ points: [b.b, r.a], current: true }), b.node, r.node], 260, 160);
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 0).pixels))).toBe(true);
  });
});
