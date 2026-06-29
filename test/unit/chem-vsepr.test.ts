import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, chem } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";

const { vseprShape, electronConfig, electronConfiguration, configNotation } = chem;
const scene = (nodes: Node[]): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 500,
  height: 400,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes,
});
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("vseprShape", () => {
  it("draws a tetrahedral centre with 4 bonds (a wedge + a dash) and the angle", () => {
    const t = vseprShape({ id: "t", x: 130, y: 130, geometry: "tetrahedral", center: "C", terminal: "H" });
    expect(kids(t).filter((n) => /^t-b\d+$/.test(n.id))).toHaveLength(4);
    const wedge = kids(t).find((n) => n.id === "t-b2") as { closed?: boolean };
    expect(wedge.closed).toBe(true); // front bond is a filled wedge
    const dash = kids(t).find((n) => n.id === "t-b3") as { dash?: number[] };
    expect(Array.isArray(dash.dash)).toBe(true); // back bond is dashed
    expect((kids(t).find((n) => n.id === "t-center") as { text?: string }).text).toBe("C");
    expect((kids(t).find((n) => n.id === "t-ang") as { text?: string }).text).toBe("109.5°");
    expect(validateScene(scene([t]))).toMatchObject({ valid: true });
  });
  it("places the right number of terminals for each geometry", () => {
    expect(
      kids(vseprShape({ id: "l", x: 100, y: 100, geometry: "linear", center: "C" })).filter((n) => /^l-t\d+$/.test(n.id)),
    ).toHaveLength(2);
    expect(
      kids(vseprShape({ id: "o", x: 100, y: 100, geometry: "octahedral", center: "S" })).filter((n) => /^o-t\d+$/.test(n.id)),
    ).toHaveLength(6);
  });
});

describe("electron configuration", () => {
  it("fills Aufbau order and conserves electrons", () => {
    expect(electronConfiguration(8).map((s) => `${s.sub}${s.electrons}`)).toEqual(["1s2", "2s2", "2p4"]); // oxygen
    expect(configNotation(26)).toBe("1s2 2s2 2p6 3s2 3p6 4s2 3d6"); // iron
    for (const z of [1, 6, 10, 18, 26, 54]) expect(electronConfiguration(z).reduce((s, f) => s + f.electrons, 0)).toBe(z);
  });
  it("renders orbital boxes (Hund) + a notation caption", () => {
    const e = electronConfig({ id: "e", x: 20, y: 20, z: 8 });
    expect(kids(e).filter((n) => /^e-b2-\d+$/.test(n.id))).toHaveLength(3); // 2p has 3 orbital boxes
    // 2p4 by Hund: one paired orbital (↑↓) + two singly filled (↑).
    const arrows = [0, 1, 2].map((o) => (kids(e).find((n) => n.id === `e-a2-${o}`) as { text?: string } | undefined)?.text);
    expect(arrows).toEqual(["↑↓", "↑", "↑"]);
    expect((kids(e).find((n) => n.id === "e-note") as { text?: string }).text).toBe("1s2 2s2 2p4");
    expect(validateScene(scene([e]))).toMatchObject({ valid: true });
  });
});
