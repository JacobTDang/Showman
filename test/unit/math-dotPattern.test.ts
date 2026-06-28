import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildDotPattern } from "../../src/math/dotPattern.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 200, h = 200): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

describe("dot pattern (subitizing)", () => {
  it("builds exactly n dot ellipses (n = 5)", () => {
    const g = buildDotPattern({ id: "d", n: 5, x: 0, y: 0, size: 120 });
    const ellipses = g.children.filter((c) => c.type === "ellipse");
    expect(ellipses.length).toBe(5);
    expect(g.children.length).toBe(5); // only the dots, nothing else
  });

  it("produces a valid scene", () => {
    const g = buildDotPattern({ n: 5, x: 20, y: 20, size: 120 });
    expect(validateScene(scene([g])).valid).toBe(true);
  });

  it("a center dot pixel is the dot color", () => {
    const size = 120;
    const g = buildDotPattern({ id: "dp", n: 5, x: 0, y: 0, size, color: "red" });
    const spec = scene([g], size, size);
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    // n = 5 has a dot dead-center of the box.
    expect(isColorNear(samplePixel(f, size / 2, size / 2), { r: 255, g: 0, b: 0 })).toBe(true);
  });

  it("defaults dots to theme.palette.primary", () => {
    const g = buildDotPattern({ n: 6 });
    const first = g.children[0]!;
    expect(first.type).toBe("ellipse");
    expect((first as { fill?: string }).fill).toBe("#ef6c35"); // sunshine primary
  });

  it("uses a 2-row grid for 7..10", () => {
    const g = buildDotPattern({ n: 10, size: 100 });
    const rows = new Set(g.children.map((c) => Math.round((c as { y?: number }).y ?? 0)));
    expect(rows.size).toBe(2); // exactly two rows
    expect(g.children.length).toBe(10);
  });
});
