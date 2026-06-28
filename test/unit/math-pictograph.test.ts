import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildPictograph } from "../../src/math/pictograph.js";
import { getTheme, swatch } from "../../src/theme/themes.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 600, h = 300): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

/** Parse a `#rrggbb` hex into an rgb target for `isColorNear`. */
function hexRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** Count icon (polygon) nodes anywhere in a group's children. */
function countPolygons(g: { children: Node[] }): number {
  return g.children.filter((n) => n.type === "polygon").length;
}

describe("pictograph", () => {
  it("builds a valid scene", () => {
    const pg = buildPictograph({
      id: "pg",
      x: 10,
      y: 10,
      rows: [
        { label: "Cats", count: 3 },
        { label: "Dogs", count: 5 },
      ],
    });
    expect(validateScene(scene([pg])).valid).toBe(true);
  });

  it("has total icons equal to the sum of ceil(count/unit)", () => {
    const rows = [
      { label: "Cats", count: 6 },
      { label: "Dogs", count: 7 },
      { label: "Fish", count: 2 },
    ];
    const unit = 2;
    const pg = buildPictograph({ id: "pg", rows, unit });
    const expected = rows.reduce((sum, r) => sum + Math.ceil(r.count / unit), 0);
    expect(countPolygons(pg)).toBe(expected); // ceil(6/2)+ceil(7/2)+ceil(2/2) = 3+4+1 = 8
    expect(expected).toBe(8);
  });

  it("counts icons with the default unit of 1 (one icon per item)", () => {
    const pg = buildPictograph({ id: "pg", rows: [{ label: "Apples", count: 4 }] });
    expect(countPolygons(pg)).toBe(4);
  });

  it("adds a key text only when unit > 1", () => {
    const withKey = buildPictograph({ id: "pg", rows: [{ label: "A", count: 4 }], unit: 5 });
    const noKey = buildPictograph({ id: "pg", rows: [{ label: "A", count: 4 }], unit: 1 });
    const keyText = withKey.children.find((n) => n.type === "text" && n.text.startsWith("each ="));
    expect(keyText).toBeDefined();
    expect(noKey.children.some((n) => n.type === "text" && n.text.startsWith("each ="))).toBe(false);
  });

  it("tints the first row's icons with swatch(0)", () => {
    const iconSize = 40;
    const pg = buildPictograph({ id: "pg", x: 0, y: 0, rows: [{ label: "", count: 1 }], iconSize, gap: 8 });
    const spec = scene([pg]);
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    const target = hexRgb(swatch(getTheme(), 0));
    // With an empty label the single star sits at local x=0; its center is at (radius, radius).
    expect(isColorNear(samplePixel(f, iconSize / 2, iconSize / 2), target)).toBe(true);
  });

  it("renders empty rows[] as a valid empty-ish group", () => {
    const pg = buildPictograph({ id: "pg", rows: [] });
    expect(pg.children.length).toBe(0);
    expect(validateScene(scene([pg])).valid).toBe(true);
  });

  it("stays valid with a NaN count (degenerate input) and emits no icons for it", () => {
    const pg = buildPictograph({
      id: "pg",
      x: NaN,
      y: 0,
      iconSize: -5,
      unit: NaN,
      gap: NaN,
      rows: [
        { label: "Bad", count: NaN },
        { label: "Good", count: 3 },
      ],
    });
    expect(validateScene(scene([pg])).valid).toBe(true);
    // NaN count -> 0 icons; the valid row still draws its 3.
    expect(countPolygons(pg)).toBe(3);
  });
});
