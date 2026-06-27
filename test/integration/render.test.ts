import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, assertValidScene, totalFrames, SPEC_VERSION } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { samplePixel, isColorNear, pixelsEqual } from "../helpers.js";

const RED = { r: 255, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };
const BLUE = { r: 0, g: 0, b: 255 };

/** A rect (20x20) sliding from x=10 to x=150 over 1s, at y=40. */
function movingRectScene(): SceneSpec {
  return {
    specVersion: SPEC_VERSION,
    width: 200,
    height: 100,
    fps: 10,
    duration: 1,
    background: "#ffffff",
    nodes: [
      {
        id: "slider",
        type: "rect",
        x: 10,
        y: 40,
        width: 20,
        height: 20,
        fill: "red",
        tracks: [{ property: "x", keyframes: [{ t: 0, value: 10 }, { t: 1, value: 150 }] }],
      },
    ],
  };
}

describe("renderFrame — end to end", () => {
  it("renders a validated scene to RGBA pixels of the right size", () => {
    const spec = assertValidScene(movingRectScene());
    const frame = renderFrame(spec, 0);
    expect(frame.width).toBe(200);
    expect(frame.height).toBe(100);
    expect(frame.pixels.length).toBe(200 * 100 * 4);
    expect(frame.frameIndex).toBe(0);
    expect(frame.time).toBeCloseTo(0, 9);
    expect(Buffer.isBuffer(frame.toPNG())).toBe(true);
  });

  it("the example scene is valid", () => {
    expect(validateScene(movingRectScene()).valid).toBe(true);
  });

  it("is deterministic: same frame twice is byte-identical (pixels and PNG)", () => {
    const spec = movingRectScene();
    const a = renderFrame(spec, 5);
    const b = renderFrame(spec, 5);
    expect(pixelsEqual(a.pixels, b.pixels)).toBe(true);
    expect(Buffer.compare(a.toPNG(), b.toPNG())).toBe(0);
  });

  it("animates over time: different frames differ", () => {
    const spec = movingRectScene();
    const f0 = renderFrame(spec, 0);
    const f5 = renderFrame(spec, 5);
    expect(pixelsEqual(f0.pixels, f5.pixels)).toBe(false);
  });

  it("animation is correct: the rect is where the interpolation says it is", () => {
    const spec = movingRectScene();

    // Frame 0 (t=0): x=10, rect spans 10..30, center (20, 50).
    const f0 = renderFrame(spec, 0);
    expect(isColorNear(samplePixel(f0, 20, 50), RED)).toBe(true);
    expect(isColorNear(samplePixel(f0, 90, 50), WHITE)).toBe(true);

    // Frame 5 (t=0.5): x = 10 + (150-10)*0.5 = 80, rect spans 80..100, center (90, 50).
    const f5 = renderFrame(spec, 5);
    expect(isColorNear(samplePixel(f5, 90, 50), RED)).toBe(true);
    expect(isColorNear(samplePixel(f5, 20, 50), WHITE)).toBe(true); // rect has left x=20
  });

  it("respects fps when mapping frame index to time", () => {
    // Same animation, doubled fps -> the rect at frame 10 of 20fps equals frame 5 of 10fps (both t=0.5).
    const slow = movingRectScene();
    const fast: SceneSpec = { ...movingRectScene(), fps: 20 };
    expect(totalFrames(slow.fps, slow.duration)).toBe(10);
    expect(totalFrames(fast.fps, fast.duration)).toBe(20);
    const slowMid = renderFrame(slow, 5); // t=0.5
    const fastMid = renderFrame(fast, 10); // t=0.5
    expect(pixelsEqual(slowMid.pixels, fastMid.pixels)).toBe(true);
  });

  it("cascades group transforms to children", () => {
    const spec: SceneSpec = {
      specVersion: SPEC_VERSION,
      width: 200,
      height: 100,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "g",
          type: "group",
          x: 100,
          y: 0,
          children: [{ id: "child", type: "rect", x: 0, y: 40, width: 20, height: 20, fill: "blue" }],
        },
      ],
    };
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    // Child at local x=0 inside a group at x=100 -> absolute 100..120, center (110, 50).
    expect(isColorNear(samplePixel(f, 110, 50), BLUE)).toBe(true);
    expect(isColorNear(samplePixel(f, 10, 50), WHITE)).toBe(true);
  });

  it("multiplies opacity down through groups", () => {
    const spec: SceneSpec = {
      specVersion: SPEC_VERSION,
      width: 100,
      height: 100,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "g",
          type: "group",
          opacity: 0.5,
          children: [{ id: "r", type: "rect", x: 0, y: 0, width: 100, height: 100, fill: "red", opacity: 0.5 }],
        },
      ],
    };
    const f = renderFrame(spec, 0);
    // Effective alpha 0.25: red over white => R=255, G=B=255*0.75≈191.
    const p = samplePixel(f, 50, 50);
    expect(p.r).toBeGreaterThan(248);
    expect(Math.abs(p.g - 191)).toBeLessThanOrEqual(4);
    expect(Math.abs(p.b - 191)).toBeLessThanOrEqual(4);
  });

  it("honors a transparent background", () => {
    const spec: SceneSpec = {
      specVersion: SPEC_VERSION,
      width: 100,
      height: 100,
      fps: 1,
      duration: 1,
      background: "transparent",
      nodes: [{ id: "r", type: "rect", x: 50, y: 50, width: 20, height: 20, fill: "red" }],
    };
    const f = renderFrame(spec, 0);
    expect(samplePixel(f, 0, 0).a).toBe(0); // empty corner is transparent
    expect(samplePixel(f, 60, 60).a).toBe(255); // inside the rect is opaque
  });

  it("renders pinned-font text (draws dark pixels on a light background)", () => {
    const spec: SceneSpec = {
      specVersion: SPEC_VERSION,
      width: 200,
      height: 120,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [
        { id: "t", type: "text", x: 100, y: 60, text: "5", fontSize: 80, fontWeight: 800, fill: "#000000", align: "center", baseline: "middle" },
      ],
    };
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    let darkPixels = 0;
    for (let i = 0; i < f.pixels.length; i += 4) {
      if (f.pixels[i]! < 100 && f.pixels[i + 1]! < 100 && f.pixels[i + 2]! < 100) darkPixels++;
    }
    expect(darkPixels).toBeGreaterThan(50); // the glyph actually rendered
  });

  it("interpolates a color track through the renderer", () => {
    const spec: SceneSpec = {
      specVersion: SPEC_VERSION,
      width: 100,
      height: 100,
      fps: 2,
      duration: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "r",
          type: "rect",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: "#000000",
          tracks: [{ property: "fill", keyframes: [{ t: 0, value: "#000000" }, { t: 1, value: "#ffffff" }] }],
        },
      ],
    };
    // frame 1 of fps 2 => t=0.5 => mid-gray (~128).
    const mid = renderFrame(spec, 1);
    const p = samplePixel(mid, 50, 50);
    expect(Math.abs(p.r - 128)).toBeLessThanOrEqual(2);
    expect(Math.abs(p.g - 128)).toBeLessThanOrEqual(2);
    expect(Math.abs(p.b - 128)).toBeLessThanOrEqual(2);
  });

  it("rejects invalid frame indices", () => {
    const spec = movingRectScene();
    expect(() => renderFrame(spec, -1)).toThrow();
    expect(() => renderFrame(spec, 1.5)).toThrow();
  });
});

describe("render regressions (from adversarial review)", () => {
  const MINT = { r: 152, g: 255, b: 152 };
  const CREAM = { r: 253, g: 246, b: 227 };

  it("paints static engine-named colors (incl. custom 'mint'/'cream') instead of silently ignoring them", () => {
    // Regression: these are not CSS names, so passing them raw made the canvas keep
    // the previous fill. The engine now normalizes every color before drawing.
    const spec: SceneSpec = {
      specVersion: 1,
      width: 60,
      height: 60,
      fps: 1,
      duration: 1,
      background: "cream",
      nodes: [{ id: "r", type: "rect", x: 20, y: 20, width: 20, height: 20, fill: "mint" }],
    };
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    expect(isColorNear(samplePixel(f, 30, 30), MINT)).toBe(true); // rect is actually mint
    expect(isColorNear(samplePixel(f, 3, 3), CREAM)).toBe(true); // background is actually cream
  });

  it("renders a stroke with no fill", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 100,
      height: 100,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [{ id: "r", type: "rect", x: 20, y: 20, width: 60, height: 60, fill: "transparent", stroke: "blue", strokeWidth: 10 }],
    };
    const f = renderFrame(spec, 0);
    expect(isColorNear(samplePixel(f, 20, 50), { r: 0, g: 0, b: 255 })).toBe(true); // on the left stroke edge
    expect(isColorNear(samplePixel(f, 50, 50), WHITE)).toBe(true); // interior is unfilled
  });

  it("rounds rectangle corners (corner pixel is background, center is fill)", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 100,
      height: 100,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [{ id: "r", type: "rect", x: 0, y: 0, width: 100, height: 100, radius: 40, fill: "red" }],
    };
    const f = renderFrame(spec, 0);
    expect(isColorNear(samplePixel(f, 1, 1), WHITE)).toBe(true); // clipped corner
    expect(isColorNear(samplePixel(f, 50, 50), RED)).toBe(true); // center filled
  });

  it("rotates around an anchor (a pixel filled only after a 90° rotation)", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 200,
      height: 200,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [
        { id: "bar", type: "rect", x: 100, y: 100, width: 80, height: 8, fill: "red", anchor: { x: 40, y: 4 }, rotation: 90 },
      ],
    };
    const f = renderFrame(spec, 0);
    // The horizontal bar becomes vertical about its center (140,104).
    expect(isColorNear(samplePixel(f, 140, 70), RED)).toBe(true); // only covered after rotation
    expect(isColorNear(samplePixel(f, 170, 104), WHITE)).toBe(true); // covered before, empty after
  });

  it("clamps animated geometry that samples negative (no throw, nothing drawn)", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 60,
      height: 60,
      fps: 2,
      duration: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "r",
          type: "rect",
          x: 10,
          y: 10,
          fill: "red",
          tracks: [{ property: "width", keyframes: [{ t: 0, value: 40 }, { t: 1, value: -40 }] }],
        },
      ],
    };
    // At t=0.5 the width track samples 0; nothing should be drawn and it must not throw.
    const f = renderFrame(spec, 1);
    expect(isColorNear(samplePixel(f, 30, 30), WHITE)).toBe(true);
  });
});
