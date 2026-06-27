import { describe, it, expect } from "vitest";
import { parseColor, rgbaToString, isParseableColor } from "../../src/index.js";

describe("parseColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseColor("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("#00FF00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
  });

  it("parses 8-digit hex with alpha", () => {
    const c = parseColor("#0000ff80");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(0);
    expect(c!.b).toBe(255);
    expect(c!.a).toBeCloseTo(128 / 255, 5);
  });

  it("parses 3- and 4-digit shorthand hex", () => {
    expect(parseColor("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    const c = parseColor("#f008");
    expect(c!.r).toBe(255);
    expect(c!.a).toBeCloseTo((8 * 17) / 255, 5);
  });

  it("parses rgb() and rgba()", () => {
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    const c = parseColor("rgba(10, 20, 30, 0.5)");
    expect(c!.a).toBeCloseTo(0.5, 5);
  });

  it("clamps out-of-range rgb channels", () => {
    expect(parseColor("rgb(300, -5, 999)")).toEqual({ r: 255, g: 0, b: 255, a: 1 });
  });

  it("parses named colors (including child-friendly ones)", () => {
    expect(parseColor("white")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseColor("CORAL")).not.toBeNull(); // case-insensitive
    expect(parseColor("cream")).toEqual({ r: 253, g: 246, b: 227, a: 1 });
  });

  it("returns null for unparseable input", () => {
    expect(parseColor("not-a-color")).toBeNull();
    expect(parseColor("#12")).toBeNull();
    expect(parseColor("rgb(1,2)")).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(parseColor("hsl(0,100%,50%)")).toBeNull(); // unsupported in M0
  });

  it("isParseableColor mirrors parseColor", () => {
    expect(isParseableColor("#abc")).toBe(true);
    expect(isParseableColor("banana")).toBe(false);
  });

  it("round-trips through rgbaToString into a canvas-ready string", () => {
    expect(rgbaToString({ r: 10, g: 20, b: 30, a: 0.5 })).toBe("rgba(10, 20, 30, 0.5)");
    expect(rgbaToString({ r: 300, g: -1, b: 128, a: 2 })).toBe("rgba(255, 0, 128, 1)");
  });
});
