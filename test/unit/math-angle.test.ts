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

  // Ray B endpoint = (L·cosθ, −L·sinθ): CCW math angle, screen y up = negative.
  const rayBEnd = (g: ReturnType<typeof buildAngle>): { x: number; y: number } => {
    const rayB = g.children.filter((c) => c.type === "polyline")[1]!;
    if (rayB.type !== "polyline") throw new Error("no ray B");
    return rayB.points[1]!;
  };

  it("rotates ray B by the opening (90° → straight up)", () => {
    const g = buildAngle({ id: "a", degrees: 90, rayLength: 90 });
    const end = rayBEnd(g);
    expect(end.x).toBeCloseTo(0); // cos 90° = 0
    expect(end.y).toBeCloseTo(-90); // −sin 90° · 90 = −90 (up)
    // Exactly one arc wedge spanning the 90° opening (startAngle..endAngle = 0..90).
    const arcs = g.children.filter((c) => c.type === "arc");
    expect(arcs.length).toBe(1);
    const arc = arcs[0]!;
    if (arc.type === "arc") {
      expect(arc.startAngle ?? NaN).toBeCloseTo(0); // 90 − degrees
      expect(arc.endAngle ?? NaN).toBeCloseTo(90); // ray A (+x)
    }
  });

  it("computes ray B trig for a non-right angle (30°)", () => {
    const end = rayBEnd(buildAngle({ id: "a", degrees: 30, rayLength: 90 }));
    expect(end.x).toBeCloseTo(77.94, 1); // 90·cos30°
    expect(end.y).toBeCloseTo(-45, 1); // −90·sin30°
  });

  it("clamps an over-360 opening to 360° (label and all)", () => {
    const g = buildAngle({ id: "a", degrees: 400 });
    const label = g.children.find((c) => c.type === "text");
    expect(label && label.type === "text" ? label.text : "").toBe("360°");
    const arc = g.children.find((c) => c.type === "arc");
    if (arc && arc.type === "arc") expect(arc.startAngle ?? NaN).toBeCloseTo(90 - 360); // −270
  });
});
