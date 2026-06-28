import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildMathExpr, type ExprPart } from "../../src/math/mathExpr.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 400, h = 200): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

describe("buildMathExpr", () => {
  const parts: ExprPart[] = [
    { kind: "text", text: "y = " },
    { kind: "frac", num: "1", den: "2" },
    { kind: "text", text: "x" },
    { kind: "pow", base: "", exp: "2" },
  ];

  it("builds a valid scene with a fraction bar and multiple text nodes", () => {
    const expr = buildMathExpr({ id: "e", parts, x: 20, y: 100, fontSize: 40 });
    const spec = scene([expr]);
    expect(validateScene(spec).valid).toBe(true);

    const polylines = expr.children.filter((c) => c.type === "polyline");
    const texts = expr.children.filter((c) => c.type === "text");
    expect(polylines.length).toBeGreaterThanOrEqual(1); // the fraction divider rule
    expect(texts.length).toBeGreaterThan(1); // y=, 1, 2, x, exponent …
  });

  it("renders without throwing", () => {
    const expr = buildMathExpr({ id: "e", parts, x: 20, y: 100, fill: "#e63946" });
    const spec = scene([expr]);
    expect(() => renderFrame(spec, 0)).not.toThrow();
  });

  it("draws the fraction rule in the requested fill color", () => {
    // A lone fraction so we know exactly where the divider lands.
    const expr = buildMathExpr({ id: "f", parts: [{ kind: "frac", num: "1", den: "2" }], x: 40, y: 100, fontSize: 40, fill: "#e63946" });
    const spec = scene([expr]);
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    // The rule spans the fraction width on the midline (local y = 0 -> y = 100).
    expect(isColorNear(samplePixel(f, 45, 100), { r: 230, g: 57, b: 70 }, 40)).toBe(true);
  });
});
