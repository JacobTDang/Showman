import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { blurIn, blurOut, crossFade } from "../../src/motion/transitions.js";
import { samplePixel, isColorNear } from "../helpers.js";

const WHITE = { r: 255, g: 255, b: 255 };
function scene(nodes: Node[], w = 60, h = 60): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

describe("blend modes", () => {
  it("multiplies overlapping colors (red × green → dark)", () => {
    const f = renderFrame(
      scene([
        { id: "r", type: "rect", x: 5, y: 15, width: 30, height: 30, fill: "#ff0000" },
        { id: "g", type: "rect", x: 25, y: 15, width: 30, height: 30, fill: "#00ff00", blend: "multiply" },
      ]),
      0,
    );
    const overlap = samplePixel(f, 30, 30);
    expect(overlap.r + overlap.g + overlap.b).toBeLessThan(60); // red*green ≈ black
    expect(isColorNear(samplePixel(f, 10, 30), { r: 255, g: 0, b: 0 })).toBe(true); // red only
    expect(isColorNear(samplePixel(f, 50, 30), { r: 0, g: 255, b: 0 })).toBe(true); // green only
  });

  it("validates the blend enum", () => {
    const codes = (n: unknown) =>
      validateScene({ specVersion: 1, width: 40, height: 40, fps: 1, duration: 1, nodes: [n] }).errors.map((e) => e.code);
    expect(codes({ id: "r", type: "rect", blend: "weird" })).toContain("INVALID_VALUE");
    expect(validateScene(scene([{ id: "r", type: "rect", blend: "screen" }])).valid).toBe(true);
  });
});

describe("blur", () => {
  it("spreads color beyond the shape edge, and is deterministic", () => {
    const sharp = scene([{ id: "r", type: "rect", x: 20, y: 20, width: 20, height: 20, fill: "#000000" }]);
    const blurred = scene([{ id: "r", type: "rect", x: 20, y: 20, width: 20, height: 20, fill: "#000000", blur: 5 }]);
    expect(isColorNear(samplePixel(renderFrame(sharp, 0), 16, 30), WHITE)).toBe(true); // crisp edge — still white
    expect(isColorNear(samplePixel(renderFrame(blurred, 0), 16, 30), WHITE)).toBe(false); // blur bleeds out
    expect(Buffer.compare(renderFrame(blurred, 0).toPNG(), renderFrame(blurred, 0).toPNG())).toBe(0);
  });

  it("rejects a negative blur", () => {
    const codes = validateScene({
      specVersion: 1,
      width: 40,
      height: 40,
      fps: 1,
      duration: 1,
      nodes: [{ id: "r", type: "rect", blur: -2 }],
    }).errors.map((e) => e.code);
    expect(codes).toContain("OUT_OF_RANGE");
  });
});

describe("group clip (spotlight / mask)", () => {
  it("clips children to the window and rejects a bad clip", () => {
    const f = renderFrame(
      scene([
        {
          id: "g",
          type: "group",
          x: 0,
          y: 0,
          clip: { width: 30, height: 30 },
          children: [{ id: "big", type: "rect", x: 0, y: 0, width: 60, height: 60, fill: "#ff0000" }],
        },
      ]),
      0,
    );
    expect(isColorNear(samplePixel(f, 15, 15), { r: 255, g: 0, b: 0 })).toBe(true); // inside the clip
    expect(isColorNear(samplePixel(f, 45, 45), WHITE)).toBe(true); // outside the clip → background

    const codes = validateScene({
      specVersion: 1,
      width: 40,
      height: 40,
      fps: 1,
      duration: 1,
      nodes: [{ id: "g", type: "group", clip: { width: -1, height: 10 }, children: [] }],
    }).errors.map((e) => e.code);
    expect(codes).toContain("INVALID_VALUE");
  });
});

describe("compositing robustness (review fixes)", () => {
  it("never crashes on a non-finite or huge blur (degrades to a no-op / cap)", () => {
    for (const blur of [NaN, Infinity, -Infinity, 1e9]) {
      const spec = {
        specVersion: 1,
        width: 40,
        height: 40,
        fps: 1,
        duration: 1,
        background: "#fff",
        nodes: [{ id: "r", type: "rect", x: 5, y: 5, width: 20, height: 20, fill: "#000000", blur }],
      } as unknown as SceneSpec;
      expect(() => renderFrame(spec, 0).toPNG()).not.toThrow();
    }
  });

  it("rejects a zero-dimension clip and a negative animated blur", () => {
    const errs = (n: unknown) =>
      validateScene({ specVersion: 1, width: 40, height: 40, fps: 1, duration: 1, nodes: [n] }).errors.map((e) => e.code);
    expect(errs({ id: "g", type: "group", clip: { width: 0, height: 10 }, children: [] })).toContain("INVALID_VALUE");
    expect(errs({ id: "r", type: "rect", tracks: [{ property: "blur", keyframes: [{ t: 0, value: -3 }] }] })).toContain("OUT_OF_RANGE");
  });
});

describe("transitions", () => {
  it("blurIn / blurOut animate blur + opacity", () => {
    const inT = blurIn({ start: 0, duration: 1, amount: 10 });
    expect(inT.find((t) => t.property === "blur")!.keyframes.map((k) => k.value)).toEqual([10, 0]);
    expect(inT.find((t) => t.property === "opacity")!.keyframes.map((k) => k.value)).toEqual([0, 1]);
    const outT = blurOut({ amount: 8 });
    expect(outT.find((t) => t.property === "blur")!.keyframes.map((k) => k.value)).toEqual([0, 8]);
  });
  it("crossFade fades outgoing out and incoming in", () => {
    const { outgoing, incoming } = crossFade({ at: 2, duration: 0.5 });
    expect(outgoing[0]!.keyframes.map((k) => k.value)).toEqual([1, 0]);
    expect(incoming[0]!.keyframes.map((k) => k.value)).toEqual([0, 1]);
    expect(incoming[0]!.keyframes[0]!.t).toBe(2);
  });
});
