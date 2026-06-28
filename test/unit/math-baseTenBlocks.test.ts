import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildBaseTenBlocks } from "../../src/math/baseTenBlocks.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 600, h = 220): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

/** Count rect nodes anywhere in the tree whose width is approximately `unit`. */
function countUnitRects(node: Node, unit: number): number {
  let n = 0;
  if (node.type === "rect" && Math.abs((node.width ?? 100) - unit) < 0.5) n += 1;
  if (node.type === "group") for (const c of node.children) n += countUnitRects(c, unit);
  return n;
}

describe("base-ten place-value blocks", () => {
  it("builds a valid scene", () => {
    const g = buildBaseTenBlocks({ id: "bt", hundreds: 1, tens: 2, ones: 3, x: 10, y: 20 });
    expect(validateScene(scene([g])).valid).toBe(true);
  });

  it("has one top-level block group per place-value block", () => {
    const g = buildBaseTenBlocks({ hundreds: 2, tens: 3, ones: 4 });
    expect(g.children.length).toBe(2 + 3 + 4);
    // children length grows with inputs.
    const more = buildBaseTenBlocks({ hundreds: 2, tens: 3, ones: 5 });
    expect(more.children.length).toBeGreaterThan(g.children.length);
  });

  it("ones=4 yields at least 4 unit squares", () => {
    const unit = 16;
    const g = buildBaseTenBlocks({ ones: 4, unit });
    expect(countUnitRects(g, unit)).toBeGreaterThanOrEqual(4);
  });

  it("is a pure function of its options (same opts → identical spec)", () => {
    const a = buildBaseTenBlocks({ id: "p", hundreds: 1, tens: 1, ones: 1 });
    const b = buildBaseTenBlocks({ id: "p", hundreds: 1, tens: 1, ones: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("renders the secondary fill for a ones block", () => {
    const unit = 16;
    const g = buildBaseTenBlocks({ id: "ot", ones: 1, unit, x: 10, y: 10, theme: "sunshine" });
    const spec = scene([g], 120, 200);
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    // The ones block rests on the baseline (local y = 10*unit). Sample its center.
    const px = 10 + unit / 2; // 18
    const py = 10 + (10 * unit - unit) + unit / 2; // 10 + 144 + 8 = 162
    // sunshine secondary = #1d6f72
    expect(isColorNear(samplePixel(f, Math.round(px), Math.round(py)), { r: 0x1d, g: 0x6f, b: 0x72 })).toBe(true);
  });
});
