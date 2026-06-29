import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { samplePixel, isColorNear } from "../helpers.js";

const RED = { r: 255, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

function scene(nodes: Node[], w = 60, h = 60): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

describe("path primitive (SVG d)", () => {
  it("fills an SVG path", () => {
    const spec = scene([{ id: "p", type: "path", x: 0, y: 0, d: "M5 5 H45 V45 H5 Z", fill: "red" }]);
    expect(validateScene(spec).valid).toBe(true);
    expect(isColorNear(samplePixel(renderFrame(spec, 0), 25, 25), RED)).toBe(true);
    expect(isColorNear(samplePixel(renderFrame(spec, 0), 1, 1), WHITE)).toBe(true);
  });

  it("renders nothing for malformed path data (no throw)", () => {
    const spec = scene([{ id: "p", type: "path", x: 0, y: 0, d: "totally not a path", fill: "red" }]);
    expect(() => renderFrame(spec, 0).toPNG()).not.toThrow();
    expect(isColorNear(samplePixel(renderFrame(spec, 0), 25, 25), WHITE)).toBe(true);
  });

  it("hides at progress 0", () => {
    const spec = scene([{ id: "p", type: "path", x: 0, y: 0, d: "M5 5 H45 V45 H5 Z", fill: "red", progress: 0 }]);
    expect(isColorNear(samplePixel(renderFrame(spec, 0), 25, 25), WHITE)).toBe(true);
  });

  it("validates path props", () => {
    const codes = (n: unknown) =>
      validateScene({ specVersion: 1, width: 50, height: 50, fps: 1, duration: 1, nodes: [n] }).errors.map((e) => e.code);
    expect(codes({ id: "p", type: "path" })).toContain("MISSING_FIELD"); // no d
    expect(codes({ id: "p", type: "path", d: "M0 0 L1 1", fillRule: "weird" })).toContain("INVALID_VALUE");
    expect(codes({ id: "p", type: "path", d: "M0 0 L1 1", progress: 2 })).toContain("OUT_OF_RANGE");
  });
});

describe("polyline shape morph", () => {
  // A small square near top-left, morphing to the same square translated to bottom-right.
  const make = (morph: number): SceneSpec =>
    scene([
      {
        id: "m",
        type: "polyline",
        x: 0,
        y: 0,
        closed: true,
        fill: "red",
        strokeWidth: 1,
        points: [
          { x: 5, y: 5 },
          { x: 15, y: 5 },
          { x: 15, y: 15 },
          { x: 5, y: 15 },
        ],
        morphTo: [
          { x: 45, y: 45 },
          { x: 55, y: 45 },
          { x: 55, y: 55 },
          { x: 45, y: 55 },
        ],
        morph,
      },
    ]);

  it("is at the source shape when morph=0", () => {
    const f = renderFrame(make(0), 0);
    expect(isColorNear(samplePixel(f, 10, 10), RED)).toBe(true); // top-left filled
    expect(isColorNear(samplePixel(f, 50, 50), WHITE)).toBe(true); // bottom-right empty
  });

  it("is at the target shape when morph=1", () => {
    const f = renderFrame(make(1), 0);
    expect(isColorNear(samplePixel(f, 50, 50), RED)).toBe(true); // moved to bottom-right
    expect(isColorNear(samplePixel(f, 10, 10), WHITE)).toBe(true); // left top-left
  });

  it("validates morph props", () => {
    const codes = (n: unknown) =>
      validateScene({ specVersion: 1, width: 50, height: 50, fps: 1, duration: 1, nodes: [n] }).errors.map((e) => e.code);
    const base = {
      id: "m",
      type: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    expect(codes({ ...base, morphTo: [{ x: 0, y: 0 }] })).toContain("OUT_OF_RANGE"); // length mismatch
    expect(codes({ ...base, morph: 2 })).toContain("OUT_OF_RANGE");
  });
});
