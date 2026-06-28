import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildAngle } from "../../src/math/angle.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 200, h = 200): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

describe("geometry angle", () => {
  it("builds a valid scene with exactly two rays and an arc", () => {
    const g = buildAngle({ id: "a", degrees: 90, x: 100, y: 100 });
    const spec = scene([g]);
    expect(validateScene(spec).valid).toBe(true);

    const polylines = g.children.filter((c) => c.type === "polyline");
    const arcs = g.children.filter((c) => c.type === "arc");
    expect(polylines.length).toBe(2); // the two rays
    expect(arcs.length).toBeGreaterThanOrEqual(1); // the angle marker
  });

  it("draws ray A horizontally to the right of the vertex", () => {
    // Vertex at (100, 100); ray A runs right to (190, 100) in red.
    const g = buildAngle({ id: "a", degrees: 90, x: 100, y: 100, rayLength: 90, color: "red" });
    const f = renderFrame(scene([g]), 0);
    expect(isColorNear(samplePixel(f, 140, 100), { r: 255, g: 0, b: 0 })).toBe(true);
  });

  it("defaults the label to `${degrees}°` and honors overrides", () => {
    const a = buildAngle({ degrees: 45 });
    const labelA = a.children.find((c) => c.type === "text");
    expect(labelA && labelA.type === "text" ? labelA.text : "").toBe("45°");

    const b = buildAngle({ degrees: 45, label: "θ" });
    const labelB = b.children.find((c) => c.type === "text");
    expect(labelB && labelB.type === "text" ? labelB.text : "").toBe("θ");
  });

  it("is a pure function of its options", () => {
    expect(buildAngle({ id: "a", degrees: 60, x: 10, y: 20 })).toEqual(buildAngle({ id: "a", degrees: 60, x: 10, y: 20 }));
  });
});
