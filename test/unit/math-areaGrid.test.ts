import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildAreaGrid } from "../../src/math/areaGrid.js";
import { getTheme } from "../../src/theme/themes.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 320, h = 260): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

/** Parse a `#rrggbb` hex into an rgb target for `isColorNear`. */
function hexRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

describe("area grid", () => {
  it("builds a valid scene", () => {
    const g = buildAreaGrid({ id: "ag", x: 10, y: 10, rows: 3, cols: 4 });
    expect(validateScene(scene([g])).valid).toBe(true);
  });

  it("has exactly rows*cols rect cells for a 3x4 grid", () => {
    const g = buildAreaGrid({ id: "ag", rows: 3, cols: 4 });
    const rects = g.children.filter((n) => n.type === "rect");
    expect(rects.length).toBe(12);
  });

  it("includes the area label rows × cols = product", () => {
    const g = buildAreaGrid({ id: "ag", rows: 3, cols: 4 });
    const texts = g.children.filter((n): n is Extract<Node, { type: "text" }> => n.type === "text");
    expect(texts.some((t) => t.text === "3 × 4 = 12")).toBe(true);
  });

  it("paints a shaded cell with the accent fill color", () => {
    const unit = 34;
    const g = buildAreaGrid({ id: "ag", x: 0, y: 0, rows: 3, cols: 4, unit, shaded: 2 });
    const spec = scene([g]);
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    const accent = hexRgb(getTheme().palette.accent);

    // Grid sits at local (margin, margin) with margin === unit; cell 0 center is
    // at (unit + unit/2, unit + unit/2). It is shaded → reads as accent.
    const cx = unit + unit / 2;
    const cy = unit + unit / 2;
    expect(isColorNear(samplePixel(f, cx, cy), accent)).toBe(true);

    // The last cell (index 11) is unshaded → stays white.
    const lastCx = unit + 3 * unit + unit / 2;
    const lastCy = unit + 2 * unit + unit / 2;
    expect(isColorNear(samplePixel(f, lastCx, lastCy), { r: 255, g: 255, b: 255 })).toBe(true);
  });

  it("terminates and stays valid for degenerate inputs (huge / NaN)", () => {
    const g = buildAreaGrid({ id: "ag", rows: 1e9, cols: NaN, unit: -5, shaded: Infinity });
    // rows capped to 40, cols replaced with 1 → 40 cells, none non-finite.
    const rects = g.children.filter((n) => n.type === "rect");
    expect(rects.length).toBe(40);
    expect(validateScene(scene([g])).valid).toBe(true);
  });
});
