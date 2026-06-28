import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import {
  buildGraphingLesson,
  buildQuadraticLesson,
  buildAdditionLesson,
  buildFractionLesson,
  buildMathLesson,
  type MathTopic,
} from "../../src/math/lessons.js";

describe("math lessons", () => {
  it("graphing lesson is valid and renders, with a narration track", () => {
    const spec = buildGraphingLesson({ m: 2, b: 1, theme: "ocean" });
    expect(validateScene(spec).valid).toBe(true);
    expect((spec.narration?.segments ?? []).length).toBeGreaterThan(0);
    // mid-draw frame renders without throwing
    expect(() => renderFrame(spec, Math.round(spec.fps * 2.5)).toPNG()).not.toThrow();
  });

  it("quadratic lesson is valid and renders", () => {
    const spec = buildQuadraticLesson({ a: 1, b: 0, c: -3, theme: "berry" });
    expect(validateScene(spec).valid).toBe(true);
    expect(() => renderFrame(spec, Math.round(spec.fps * 2.0)).toPNG()).not.toThrow();
  });

  it("addition lesson hops to the sum and is valid", () => {
    const spec = buildAdditionLesson({ a: 2, b: 3, theme: "sunshine" });
    expect(validateScene(spec).valid).toBe(true);
    // marker exists and carries x + y tracks (the hops)
    const marker = spec.nodes.find((n) => n.id === "marker");
    expect(marker?.tracks?.map((t) => t.property).sort()).toEqual(["x", "y"]);
  });

  it("fraction lesson is valid across all themes", () => {
    for (const theme of ["sunshine", "ocean", "meadow", "berry"]) {
      const spec = buildFractionLesson({ numerator: 3, denominator: 4, theme });
      expect(validateScene(spec).valid).toBe(true);
    }
  });

  it("buildMathLesson dispatches every topic to a valid, renderable lesson", () => {
    const topics: MathTopic[] = [
      "counting",
      "addition",
      "subtraction",
      "multiplication",
      "division",
      "fraction",
      "decimal",
      "percent",
      "place-value",
      "geometry",
      "graphing",
      "quadratic",
      "equation",
      "data",
    ];
    for (const topic of topics) {
      const spec = buildMathLesson(topic, { theme: "ocean" });
      expect(validateScene(spec).valid, `${topic} should be valid`).toBe(true);
      expect(() => renderFrame(spec, 30).toPNG()).not.toThrow();
    }
  });

  it("renders deterministically (same frame twice -> identical bytes)", () => {
    const spec = buildGraphingLesson({ m: -1, b: 2 });
    const a = renderFrame(spec, 40).toPNG();
    const b = renderFrame(spec, 40).toPNG();
    expect(a.equals(b)).toBe(true);
  });
});
