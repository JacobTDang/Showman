import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { samplePixel, isColorNear } from "../helpers.js";
import { finiteNum, posSize, intCount, fmtTick, clamp } from "../../src/math/shared.js";

const RED = { r: 255, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };
const BLUE = { r: 0, g: 0, b: 255 };

function darkPixels(spec: SceneSpec, frame = 0): number {
  const f = renderFrame(spec, frame);
  let n = 0;
  for (let i = 0; i < f.pixels.length; i += 4) if (f.pixels[i]! < 90 && f.pixels[i + 1]! < 90 && f.pixels[i + 2]! < 90) n++;
  return n;
}

describe("arc primitive", () => {
  it("draws a quarter pie in the top-right (12→3 o'clock)", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 100,
      height: 100,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [{ id: "a", type: "arc", x: 0, y: 0, radius: 50, startAngle: 0, endAngle: 90, fill: "red" }],
    };
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    expect(isColorNear(samplePixel(f, 65, 35), RED)).toBe(true); // top-right wedge: filled
    expect(isColorNear(samplePixel(f, 35, 35), WHITE)).toBe(true); // top-left: empty
    expect(isColorNear(samplePixel(f, 35, 65), WHITE)).toBe(true); // bottom-left: empty
  });

  it("draws a ring (annulus) with an empty centre", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 100,
      height: 100,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [{ id: "r", type: "arc", x: 0, y: 0, radius: 50, innerRadius: 25, startAngle: 0, endAngle: 360, fill: "blue" }],
    };
    const f = renderFrame(spec, 0);
    expect(isColorNear(samplePixel(f, 50, 50), WHITE)).toBe(true); // hole
    expect(isColorNear(samplePixel(f, 50, 12), BLUE)).toBe(true); // band (dist 38 from centre)
  });

  it("fills more as endAngle animates (a fraction filling)", () => {
    const make = (end: number): SceneSpec => ({
      specVersion: 1,
      width: 100,
      height: 100,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [{ id: "a", type: "arc", x: 0, y: 0, radius: 50, startAngle: 0, endAngle: end, fill: "#000000" }],
    });
    const quarter = darkPixels(make(90));
    const half = darkPixels(make(180));
    const full = darkPixels(make(360));
    expect(quarter).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(quarter);
    expect(full).toBeGreaterThan(half);
  });

  it("animates endAngle via a track", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 100,
      height: 100,
      fps: 4,
      duration: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "a",
          type: "arc",
          x: 0,
          y: 0,
          radius: 50,
          fill: "#000000",
          startAngle: 0,
          tracks: [
            {
              property: "endAngle",
              keyframes: [
                { t: 0, value: 0 },
                { t: 1, value: 360 },
              ],
            },
          ],
        },
      ],
    };
    expect(validateScene(spec).valid).toBe(true);
    expect(darkPixels(spec, 3)).toBeGreaterThan(darkPixels(spec, 1)); // later frame = more filled
  });

  it("validates arc props", () => {
    const codes = (n: unknown) =>
      validateScene({ specVersion: 1, width: 50, height: 50, fps: 1, duration: 1, nodes: [n] }).errors.map((e) => e.code);
    expect(codes({ id: "a", type: "arc", radius: -5 })).toContain("OUT_OF_RANGE");
    expect(codes({ id: "a", type: "arc", startAngle: "x" })).toContain("INVALID_TYPE");
    expect(codes({ id: "a", type: "arc", fill: "notacolor" })).toContain("INVALID_COLOR");
  });
});

describe("counter primitive", () => {
  it("renders the formatted number with prefix/suffix/decimals", () => {
    const make = (extra: Record<string, unknown>): SceneSpec => ({
      specVersion: 1,
      width: 200,
      height: 60,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [{ id: "c", type: "counter", x: 100, y: 30, fontSize: 36, fill: "#000000", ...extra }],
    });
    expect(validateScene(make({ value: 42 })).valid).toBe(true);
    expect(darkPixels(make({ value: 42 }))).toBeGreaterThan(0);
    // More digits => more ink.
    expect(darkPixels(make({ value: 8888 }))).toBeGreaterThan(darkPixels(make({ value: 8 })));
    // Decimals + prefix render (validates and draws).
    expect(validateScene(make({ value: 3.5, decimals: 1, prefix: "$" })).valid).toBe(true);
  });

  it("animates value via a track (count-up)", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 200,
      height: 60,
      fps: 4,
      duration: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "c",
          type: "counter",
          x: 100,
          y: 30,
          fontSize: 36,
          fill: "#000000",
          tracks: [
            {
              property: "value",
              keyframes: [
                { t: 0, value: 0 },
                { t: 1, value: 100 },
              ],
            },
          ],
        },
      ],
    };
    expect(validateScene(spec).valid).toBe(true);
    // value 0 -> "0" (1 digit), value ~100 -> "100" (3 digits): later frame has more ink.
    expect(darkPixels(spec, 3)).toBeGreaterThan(darkPixels(spec, 0));
  });

  it("validates counter props", () => {
    const codes = (n: unknown) =>
      validateScene({ specVersion: 1, width: 50, height: 50, fps: 1, duration: 1, nodes: [n] }).errors.map((e) => e.code);
    expect(codes({ id: "c", type: "counter", decimals: -1 })).toContain("OUT_OF_RANGE");
    expect(codes({ id: "c", type: "counter", prefix: 5 })).toContain("INVALID_TYPE");
    expect(codes({ id: "c", type: "counter", fontFamily: "Arial" })).toContain("INVALID_VALUE");
  });
});

// The shared sanitizers are the last line of defense against invalid specs (non-finite
// or negative dimensions, unbounded loop counts). Test them directly, not just via builders.
describe("math shared sanitizers", () => {
  it("finiteNum keeps finite values, clamps to [min,max], and falls back on non-finite", () => {
    expect(finiteNum(3.5, 0)).toBe(3.5);
    expect(finiteNum(NaN, 7)).toBe(7);
    expect(finiteNum(Infinity, 7)).toBe(7);
    expect(finiteNum("nope", 7)).toBe(7); // non-number → fallback
    expect(finiteNum(100, 0, 0, 10)).toBe(10); // clamp to max
    expect(finiteNum(-100, 0, -10, 10)).toBe(-10); // clamp to min
  });

  it("posSize requires a finite, strictly-positive size and clamps to [min,max]", () => {
    expect(posSize(42, 10)).toBe(42);
    expect(posSize(-3, 10)).toBe(10); // not > 0 → fallback
    expect(posSize(0, 10)).toBe(10); // not > 0 → fallback
    expect(posSize(NaN, 10)).toBe(10);
    expect(posSize(0.2, 10)).toBe(1); // clamps up to default min 1
    expect(posSize(1e9, 10)).toBe(100000); // clamps down to default max
  });

  it("intCount floors, clamps to [0,max], and caps unbounded counts", () => {
    expect(intCount(4.9, 0)).toBe(4); // floor
    expect(intCount(-5, 0)).toBe(0); // clamp to 0
    expect(intCount(NaN, 3)).toBe(3); // fallback
    expect(intCount(1e9, 0)).toBe(1000); // default cap
    expect(intCount(1e9, 0, 250)).toBe(250); // custom cap
  });

  it("fmtTick prints integers bare and others to one decimal", () => {
    expect(fmtTick(2)).toBe("2");
    expect(fmtTick(2.5)).toBe("2.5");
    expect(fmtTick(2.567)).toBe("2.6"); // rounds to 1 dp
    expect(fmtTick(-3)).toBe("-3");
  });

  it("clamp bounds a value to [lo,hi]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
