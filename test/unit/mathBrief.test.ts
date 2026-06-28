import { describe, it, expect } from "vitest";
import { parseMathBrief } from "../../src/authoring/mathBrief.js";
import { TemplateAuthor } from "../../src/authoring/templateAuthor.js";
import { validateScene } from "../../src/index.js";

describe("parseMathBrief", () => {
  it("parses a linear graph brief", () => {
    const r = parseMathBrief("graph y = 2x + 1")!;
    expect(r.topic).toBe("graphing");
    expect(r.params).toMatchObject({ m: 2, b: 1 });
  });

  it("parses y = x - 3 (implicit slope 1, negative intercept)", () => {
    const r = parseMathBrief("plot the line y = x - 3")!;
    expect(r.topic).toBe("graphing");
    expect(r.params).toMatchObject({ m: 1, b: -3 });
  });

  it("parses a parabola/quadratic brief before treating it as linear", () => {
    const r = parseMathBrief("graph the parabola y = x^2 - 4")!;
    expect(r.topic).toBe("quadratic");
    expect(r.params).toMatchObject({ a: 1, c: -4 });
  });

  it("parses a fraction-as-pie brief", () => {
    const r = parseMathBrief("show 3/4 as a pie")!;
    expect(r.topic).toBe("fraction");
    expect(r.params).toMatchObject({ numerator: 3, denominator: 4 });
  });

  it("parses addition on a number line", () => {
    const r = parseMathBrief("add 2 + 3 on a number line")!;
    expect(r.topic).toBe("addition");
    expect(r.params).toMatchObject({ a: 2, b: 3 });
  });

  it("parses multiplication", () => {
    const r = parseMathBrief("multiply 3 × 4")!;
    expect(r.topic).toBe("multiplication");
    expect(r.params).toMatchObject({ rows: 3, cols: 4 });
  });

  it("parses place value", () => {
    const r = parseMathBrief("place value of 123")!;
    expect(r.topic).toBe("place-value");
    expect(r.params).toMatchObject({ hundreds: 1, tens: 2, ones: 3 });
  });

  it("picks up a theme hint", () => {
    expect(parseMathBrief("graph y = 2x + 1 in an ocean theme")!.params.theme).toBe("ocean");
  });

  it("returns null for a non-math brief", () => {
    expect(parseMathBrief("teach counting to five with stars")).toBeNull();
  });
});

describe("TemplateAuthor routes math briefs", () => {
  it("authors a valid graphing lesson from a brief", async () => {
    const spec = await new TemplateAuthor().propose("graph y = 2x + 1");
    expect(validateScene(spec).valid).toBe(true);
  });

  it("still authors a counting lesson for a non-math brief", async () => {
    const spec = await new TemplateAuthor().propose("count to five with stars");
    expect(validateScene(spec).valid).toBe(true);
  });
});
