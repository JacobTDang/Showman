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

  it("ones=4 yields exactly 4 unit squares", () => {
    const unit = 16;
    const g = buildBaseTenBlocks({ ones: 4, unit });
    expect(countUnitRects(g, unit)).toBe(4);
  });

  it("decomposes each place value into the right internal grid (flat=18, rod=9, unit=0)", () => {
    const polys = (n: Node): number => (n.type === "polyline" ? 1 : n.type === "group" ? n.children.reduce((s, c) => s + polys(c), 0) : 0);
    const rects = (n: Node): number => (n.type === "rect" ? 1 : n.type === "group" ? n.children.reduce((s, c) => s + rects(c), 0) : 0);

    // A hundreds "flat" is a 10×10 grid: 9 vertical + 9 horizontal internal lines.
    const flat = buildBaseTenBlocks({ hundreds: 1 });
    expect(flat.children.length).toBe(1);
    expect(polys(flat.children[0]!)).toBe(18);
    expect(rects(flat.children[0]!)).toBe(1);

    // A tens "rod" is a 1×10 column: 9 horizontal internal lines, no verticals.
    const rod = buildBaseTenBlocks({ tens: 1 });
    expect(rod.children.length).toBe(1);
    expect(polys(rod.children[0]!)).toBe(9);

    // A ones "unit" is a single cell: no internal grid lines at all.
    const unit = buildBaseTenBlocks({ ones: 1 });
    expect(unit.children.length).toBe(1);
    expect(polys(unit.children[0]!)).toBe(0);
    expect(rects(unit.children[0]!)).toBe(1);
  });

  it("yields zero blocks for empty options", () => {
    const g = buildBaseTenBlocks({});
    expect(g.children.length).toBe(0);
    expect(validateScene(scene([g])).valid).toBe(true);
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
