import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildArrayGrid } from "../../src/math/arrayGrid.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 240, h = 200): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

describe("array grid (multiplication array)", () => {
  it("builds exactly rows*cols ellipses for 3x4", () => {
    const grid = buildArrayGrid({ id: "g", x: 0, y: 0, rows: 3, cols: 4 });
    expect(grid.type).toBe("group");
    expect(grid.children.length).toBe(12);
    expect(grid.children.every((c) => c.type === "ellipse")).toBe(true);
  });

  it("produces a valid scene", () => {
    const grid = buildArrayGrid({ id: "g", x: 10, y: 10, rows: 3, cols: 4, color: "red" });
    const spec = scene([grid]);
    expect(validateScene(spec).valid).toBe(true);
  });

  it("draws a dot in the dot color at its center", () => {
    // Default gap 40, dotRadius 12 → first dot center is at local (12, 12).
    const grid = buildArrayGrid({ id: "g", x: 0, y: 0, rows: 3, cols: 4, color: "red" });
    const f = renderFrame(scene([grid]), 0);
    expect(isColorNear(samplePixel(f, 12, 12), { r: 255, g: 0, b: 0 })).toBe(true);
  });

  it("is a pure function of its options", () => {
    const a = buildArrayGrid({ id: "g", rows: 2, cols: 5, gap: 30, dotRadius: 8 });
    const b = buildArrayGrid({ id: "g", rows: 2, cols: 5, gap: 30, dotRadius: 8 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
