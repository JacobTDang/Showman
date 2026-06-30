import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, chem } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";

const { beaker, erlenmeyerFlask, roundFlask, testTube, graduatedCylinder, funnel, bunsenBurner } = chem;
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
const glassware = [beaker, erlenmeyerFlask, roundFlask, testTube, graduatedCylinder, funnel];

describe("apparatus", () => {
  it("each piece draws an outline and renders validly", () => {
    for (const make of glassware) {
      const g = make({ x: 200, y: 200 });
      expect(kids(g).some((n) => /-(out|bulb)$/.test(n.id))).toBe(true);
      expect(validateScene(scene([g]))).toMatchObject({ valid: true });
    }
  });
  it("shows a liquid fill only when liquid > 0, clamped to [0,1]", () => {
    expect(kids(beaker({ id: "b", x: 100, y: 100, liquid: 0.5 })).some((n) => n.id === "b-liq")).toBe(true);
    expect(kids(beaker({ id: "b", x: 100, y: 100 })).some((n) => n.id === "b-liq")).toBe(false);
    // Over-full clamps to lvl=1 → height = 1*(height-8) = 92, never the raw 5× overflow.
    const full = beaker({ id: "b", x: 100, y: 140, height: 100, liquid: 5 });
    const liq = kids(full).find((n) => n.id === "b-liq") as { height: number };
    expect(liq.height).toBe(92);
    expect(validateScene(scene([full]))).toMatchObject({ valid: true });
  });
  it("fills the body of round-bottom flasks, test tubes, and graduated cylinders", () => {
    for (const make of [roundFlask, testTube, graduatedCylinder]) {
      const g = make({ id: "g", x: 100, y: 200, liquid: 0.5 });
      expect(kids(g).some((n) => n.id === "g-liq")).toBe(true);
      expect(validateScene(scene([g]))).toMatchObject({ valid: true });
    }
  });
  it("omits the liquid fill for a negative level", () => {
    for (const make of [beaker, roundFlask, testTube, graduatedCylinder]) {
      expect(kids(make({ id: "g", x: 100, y: 200, liquid: -1 })).some((n) => n.id === "g-liq")).toBe(false);
    }
  });
  it("a zero-height Erlenmeyer with liquid stays valid (no 0/0 NaN) (review fix)", () => {
    expect(validateScene(scene([erlenmeyerFlask({ x: 100, y: 200, height: 0, liquid: 0.5 })]))).toMatchObject({ valid: true });
  });
  it("bunsenBurner toggles its flame", () => {
    expect(kids(bunsenBurner({ id: "bb", x: 100, y: 200 })).some((n) => n.id === "bb-flame-o")).toBe(true);
    expect(kids(bunsenBurner({ id: "bb", x: 100, y: 200, flame: false })).some((n) => /-flame/.test(n.id))).toBe(false);
    expect(validateScene(scene([bunsenBurner({ x: 100, y: 200 })]))).toMatchObject({ valid: true });
  });
});
