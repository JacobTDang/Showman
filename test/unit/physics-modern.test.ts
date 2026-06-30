import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, physics } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode, PolylineNode, Track } from "../../src/index.js";

const { bohrAtom, energyLevels, pvDiagram } = physics;
const scene = (nodes: Node[]): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 600,
  height: 400,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes,
});
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("bohrAtom", () => {
  it("draws a labelled nucleus, a ring per shell, and the right electron counts", () => {
    const a = bohrAtom({ id: "a", x: 150, y: 150, shells: [2, 8, 1], symbol: "Na" });
    expect(kids(a).filter((n) => /-shell\d+$/.test(n.id))).toHaveLength(3);
    expect((kids(a).find((n) => n.id === "a-sym") as { text?: string }).text).toBe("Na");
    const ring0 = kids(a).find((n) => n.id === "a-ring0") as GroupNode;
    const ring1 = kids(a).find((n) => n.id === "a-ring1") as GroupNode;
    expect(ring0.children).toHaveLength(2); // inner shell: 2 electrons
    expect(ring1.children).toHaveLength(8); // second shell: 8
    expect(validateScene(scene([a]))).toMatchObject({ valid: true });
  });
  it("orbits the electrons when animated", () => {
    const a = bohrAtom({ id: "a", x: 100, y: 100, shells: [2, 4], animate: true });
    const ring = kids(a).find((n) => n.id === "a-ring0") as { tracks?: Track[] };
    expect(ring.tracks!.some((t) => t.property === "rotation")).toBe(true);
  });
});

describe("energyLevels", () => {
  it("draws converging levels (n=1 lowest) with a photon-emission transition", () => {
    const e = energyLevels({ id: "e", x: 20, y: 20, width: 200, height: 240, levels: 4, transition: { from: 3, to: 2 } });
    const yOf = (k: number) => (kids(e).find((n) => n.id === `e-L${k}`) as PolylineNode).points[0]!.y;
    expect(yOf(1)).toBeGreaterThan(yOf(2)); // n=1 sits below n=2 (higher local y = lower)
    expect(yOf(3) - yOf(4)).toBeLessThan(yOf(1) - yOf(2)); // levels converge toward the top
    expect((kids(e).find((n) => n.id === "e-photon") as { text?: string }).text).toBe("photon out"); // emission (3→2)
    expect(validateScene(scene([e]))).toMatchObject({ valid: true });
  });
  it("places each level at its 1 − 1/k² fractional height", () => {
    const e = energyLevels({ id: "e", x: 20, y: 20, width: 200, height: 240, levels: 4 });
    const yOf = (k: number) => (kids(e).find((n) => n.id === `e-L${k}`) as PolylineNode).points[0]!.y;
    const expected = (k: number) => 20 + 240 - (1 - 1 / (k * k)) * 240; // y + h − (1−1/k²)·h
    for (const k of [1, 2, 3, 4]) expect(yOf(k)).toBeCloseTo(expected(k), 5);
  });
  it("labels an absorption transition 'photon in' when from < to", () => {
    const e = energyLevels({ id: "e", x: 20, y: 20, width: 200, height: 240, levels: 4, transition: { from: 2, to: 4 } });
    expect((kids(e).find((n) => n.id === "e-photon") as { text?: string }).text).toBe("photon in");
  });
});

describe("pvDiagram", () => {
  it("draws an isotherm with a shaded work area", () => {
    const p = pvDiagram({ id: "p", x: 20, y: 20, width: 300, height: 240 });
    expect(kids(p).some((n) => n.id === "p-iso")).toBe(true);
    const work = kids(p).find((n) => n.id === "p-work") as PolylineNode & { closed?: boolean };
    expect(work.closed).toBe(true); // the area under the curve, shaded
    expect(validateScene(scene([p]))).toMatchObject({ valid: true });
  });
});
