import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, physics } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";

const { vectorField, pointCharge, emSpectrum, switchSym, inductor, acSource, diode, meter } = physics;
const scene = (nodes: Node[]): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 760,
  height: 460,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes,
});
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("vectorField", () => {
  it("draws an arrow per non-null grid cell and validates", () => {
    const vf = vectorField({
      id: "vf",
      x: 0,
      y: 0,
      width: 240,
      height: 180,
      cols: 5,
      rows: 4,
      field: (nx, ny) => ({ vx: nx - 0.5, vy: ny - 0.5 }),
    });
    const arrows = kids(vf).filter((n) => /-a\d+$/.test(n.id));
    expect(arrows.length).toBeGreaterThan(10); // most of the 20 cells (the dead-center null is skipped)
    expect(validateScene(scene([vf]))).toMatchObject({ valid: true });
  });
  it("skips null-magnitude points (no zero-length arrow)", () => {
    const vf = vectorField({ id: "vf", x: 0, y: 0, width: 100, height: 100, cols: 3, rows: 3, field: () => ({ vx: 0, vy: 0 }) });
    expect(kids(vf).filter((n) => /-a\d+$/.test(n.id))).toHaveLength(0);
  });
});

describe("pointCharge", () => {
  it("renders a glow + core + sign, and field arrows when asked", () => {
    const p = pointCharge({ id: "p", x: 50, y: 50, charge: 1, fieldArrows: true, arrowCount: 6 });
    const glow = kids(p).find((n) => n.id === "p-glow") as { gradient?: unknown };
    expect(glow.gradient).toBeDefined(); // radial-gradient glow (no blur)
    expect((kids(p).find((n) => n.id === "p-sign") as { text?: string }).text).toBe("+");
    expect(kids(p).filter((n) => /-f\d+$/.test(n.id))).toHaveLength(6);
    const neg = pointCharge({ id: "n", x: 0, y: 0, charge: -2 });
    expect((kids(neg).find((n) => n.id === "n-sign") as { text?: string }).text).toBe("−");
    expect(validateScene(scene([p, neg]))).toMatchObject({ valid: true });
  });
});

describe("emSpectrum", () => {
  it("lays out the labeled bands with a rainbow visible window", () => {
    const em = emSpectrum({ id: "em", x: 0, y: 0, width: 500 });
    expect(kids(em).filter((n) => /-b\d+$/.test(n.id))).toHaveLength(7); // 7 bands
    const visible = kids(em).find((n) => n.id === "em-b3") as { gradient?: unknown };
    expect(visible.gradient).toBeDefined(); // visible band is a rainbow gradient
    expect(validateScene(scene([em]))).toMatchObject({ valid: true });
  });
});

describe("circuit symbol expansion", () => {
  it("each new symbol exposes left/right terminals and validates", () => {
    for (const sym of [switchSym, inductor, acSource, diode]) {
      const s = sym({ x: 10, y: 50, size: 80, label: "X" });
      expect(s.a).toEqual({ x: 10, y: 50 });
      expect(s.b).toEqual({ x: 90, y: 50 });
      expect(validateScene(scene([s.node]))).toMatchObject({ valid: true });
    }
  });
  it("meter shows its symbol letter", () => {
    const m = meter({ id: "m", x: 0, y: 40, size: 70, symbol: "V" });
    expect((kids(m.node).find((n) => n.id === "m-sym") as { text?: string }).text).toBe("V");
  });
  it("an inductor has a multi-bump coil polyline", () => {
    const ind = inductor({ id: "ind", x: 0, y: 40, size: 80 });
    const coil = kids(ind.node).find((n) => n.id === "ind-coil") as { points?: unknown[] };
    expect(coil.points!.length).toBeGreaterThan(20); // 4 sampled bumps
  });
});
