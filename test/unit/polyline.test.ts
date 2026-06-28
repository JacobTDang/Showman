import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { samplePixel, isColorNear } from "../helpers.js";

const RED = { r: 255, g: 0, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };
const WHITE = { r: 255, g: 255, b: 255 };

function nonWhitePixels(spec: SceneSpec, frame = 0): number {
  const f = renderFrame(spec, frame);
  let n = 0;
  for (let i = 0; i < f.pixels.length; i += 4) {
    if (f.pixels[i]! < 240 || f.pixels[i + 1]! < 240 || f.pixels[i + 2]! < 240) n++;
  }
  return n;
}

describe("polyline primitive", () => {
  it("strokes a line segment", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 100,
      height: 40,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "l",
          type: "polyline",
          x: 0,
          y: 0,
          points: [
            { x: 10, y: 20 },
            { x: 90, y: 20 },
          ],
          stroke: "red",
          strokeWidth: 4,
        },
      ],
    };
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    expect(isColorNear(samplePixel(f, 50, 20), RED)).toBe(true); // on the line
    expect(isColorNear(samplePixel(f, 50, 5), WHITE)).toBe(true); // above it
  });

  it("fills a closed shape (triangle)", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 100,
      height: 60,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "t",
          type: "polyline",
          x: 0,
          y: 0,
          points: [
            { x: 50, y: 5 },
            { x: 90, y: 55 },
            { x: 10, y: 55 },
          ],
          closed: true,
          fill: "blue",
          strokeWidth: 1,
        },
      ],
    };
    expect(validateScene(spec).valid).toBe(true);
    expect(isColorNear(samplePixel(renderFrame(spec, 0), 50, 42), BLUE)).toBe(true);
  });

  it("draws only the first portion at progress<1 (draw-on)", () => {
    const make = (progress: number): SceneSpec => ({
      specVersion: 1,
      width: 100,
      height: 40,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "l",
          type: "polyline",
          x: 0,
          y: 0,
          points: [
            { x: 10, y: 20 },
            { x: 90, y: 20 },
          ],
          stroke: "red",
          strokeWidth: 4,
          progress,
        },
      ],
    });
    const f = renderFrame(make(0.5), 0);
    expect(isColorNear(samplePixel(f, 25, 20), RED)).toBe(true); // first half drawn
    expect(isColorNear(samplePixel(f, 75, 20), WHITE)).toBe(true); // second half not yet
  });

  it("animates progress via a track", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 100,
      height: 40,
      fps: 4,
      duration: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "l",
          type: "polyline",
          x: 0,
          y: 0,
          points: [
            { x: 5, y: 20 },
            { x: 95, y: 20 },
          ],
          stroke: "#000000",
          strokeWidth: 4,
          progress: 0,
          tracks: [
            {
              property: "progress",
              keyframes: [
                { t: 0, value: 0 },
                { t: 1, value: 1 },
              ],
            },
          ],
        },
      ],
    };
    expect(validateScene(spec).valid).toBe(true);
    expect(nonWhitePixels(spec, 3)).toBeGreaterThan(nonWhitePixels(spec, 1)); // more drawn later
  });

  it("validates polyline props", () => {
    const codes = (n: unknown) =>
      validateScene({ specVersion: 1, width: 50, height: 50, fps: 1, duration: 1, nodes: [n] }).errors.map((e) => e.code);
    expect(codes({ id: "l", type: "polyline" })).toContain("MISSING_FIELD"); // no points
    expect(codes({ id: "l", type: "polyline", points: [{ x: 0, y: 0 }] })).toContain("MISSING_FIELD"); // <2
    expect(
      codes({
        id: "l",
        type: "polyline",
        points: [
          { x: 0, y: 0 },
          { x: "a", y: 0 },
        ],
      }),
    ).toContain("INVALID_TYPE");
    expect(
      codes({
        id: "l",
        type: "polyline",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        progress: 2,
      }),
    ).toContain("OUT_OF_RANGE");
    expect(
      codes({
        id: "l",
        type: "polyline",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        lineCap: "weird",
      }),
    ).toContain("INVALID_VALUE");
  });
});
