import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildBalanceScale } from "../../src/math/balanceScale.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 360, h = 240): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

/** Depth-first flatten of a node tree into a flat list (root first). */
function flatten(node: Node, out: Node[] = []): Node[] {
  out.push(node);
  if (node.type === "group") for (const child of node.children) flatten(child, out);
  return out;
}

describe("balance scale", () => {
  it("builds a valid scene containing the fulcrum and two weight labels", () => {
    const g = buildBalanceScale({ left: 3, right: 5, x: 20, y: 20, width: 320 });
    const spec = scene([g]);
    expect(validateScene(spec).valid).toBe(true);

    const all = flatten(g);

    // Exactly one triangular fulcrum (polygon, sides:3).
    const polys = all.filter((n) => n.type === "polygon");
    expect(polys.length).toBe(1);
    expect((polys[0] as { sides?: number }).sides).toBe(3);

    // Two weight labels (one per pan), carrying the supplied weights.
    const counters = all.filter((n) => n.type === "counter");
    expect(counters.length).toBe(2);
    expect(counters.map((c) => (c as { value?: number }).value)).toEqual([3, 5]);
  });

  it("keeps the beam level for equal weights and tilts toward the heavier side", () => {
    const beamOf = (g: Node): Node => {
      const root = g as Node & { id: string };
      const beam = flatten(g).find((n) => n.type === "group" && n.id !== root.id);
      if (!beam) throw new Error("no beam group");
      return beam;
    };

    const level = buildBalanceScale({ left: 4, right: 4 });
    expect((beamOf(level) as { rotation?: number }).rotation).toBe(0);

    // Left heavier -> left sinks -> negative (counter-clockwise) rotation.
    const leftHeavy = buildBalanceScale({ left: 9, right: 1 });
    expect((beamOf(leftHeavy) as { rotation?: number }).rotation as number).toBeLessThan(0);

    // Right heavier -> right sinks -> positive rotation, clamped to +12°.
    const rightHeavy = buildBalanceScale({ left: 0, right: 8 });
    const rot = (beamOf(rightHeavy) as { rotation?: number }).rotation as number;
    expect(rot).toBeGreaterThan(0);
    expect(rot).toBeLessThanOrEqual(12);
  });

  it("renders the beam across the pivot", () => {
    const g = buildBalanceScale({ left: 4, right: 4, x: 20, y: 20, width: 320 });
    const f = renderFrame(scene([g]), 0);
    // Pivot is at group(20,20) + (cx=160, pivotY=44) = (180, 64); the beam covers it.
    const px = samplePixel(f, 180, 64);
    expect(isColorNear(px, { r: 255, g: 255, b: 255 })).toBe(false);
  });
});
