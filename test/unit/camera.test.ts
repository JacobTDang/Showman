import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION } from "../../src/index.js";
import type { SceneSpec, Camera, Node } from "../../src/index.js";

const node: Node = { id: "r", type: "rect", x: 120, y: 80, width: 60, height: 60, fill: "#2563eb" };
function scene(camera?: Camera, opts: Partial<SceneSpec> = {}): SceneSpec {
  return {
    specVersion: SPEC_VERSION,
    width: 300,
    height: 200,
    fps: 10,
    duration: 1,
    seed: 1,
    background: "#fff",
    ...(camera ? { camera } : {}),
    nodes: [node],
    ...opts,
  };
}

describe("camera validation", () => {
  it("accepts a well-formed camera (static + animated)", () => {
    expect(validateScene(scene({ x: 150, y: 100, zoom: 1.5 })).valid).toBe(true);
    expect(
      validateScene(
        scene({
          zoom: 1,
          tracks: [
            {
              property: "zoom",
              keyframes: [
                { t: 0, value: 1 },
                { t: 1, value: 2 },
              ],
            },
          ],
        }),
      ).valid,
    ).toBe(true);
  });
  it("rejects every malformed camera branch", () => {
    const bad = (c: unknown): boolean => validateScene(scene(c as Camera)).valid;
    expect(bad(5)).toBe(false); // not an object
    expect(bad({ zoom: 0 })).toBe(false); // zoom must be > 0
    expect(bad({ zoom: -2 })).toBe(false);
    expect(bad({ x: Number.NaN })).toBe(false); // non-finite
    expect(bad({ tracks: 7 })).toBe(false); // tracks must be an array
    expect(bad({ tracks: [{ property: "scale", keyframes: [{ t: 0, value: 1 }] }] })).toBe(false); // bad property
    expect(bad({ tracks: [{ property: "zoom", keyframes: [] }] })).toBe(false); // empty keyframes
    expect(bad({ tracks: [{ property: "zoom", keyframes: [{ t: 0, value: "x" }] }] })).toBe(false); // non-numeric kf
  });
});

describe("camera rendering", () => {
  it("zoom magnifies the scene (differs from zoom 1)", () => {
    const z1 = renderFrame(scene({ x: 150, y: 100, zoom: 1 }), 0);
    const z2 = renderFrame(scene({ x: 150, y: 100, zoom: 2 }), 0);
    expect(Buffer.from(z1.pixels).equals(Buffer.from(z2.pixels))).toBe(false);
  });
  it("an animated zoom track pushes in over time (and is deterministic)", () => {
    const s = scene({
      x: 150,
      y: 100,
      zoom: 1,
      tracks: [
        {
          property: "zoom",
          keyframes: [
            { t: 0, value: 1 },
            { t: 1, value: 2 },
          ],
        },
      ],
    });
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 9).pixels))).toBe(false); // moved
    expect(Buffer.from(renderFrame(s, 5).pixels).equals(Buffer.from(renderFrame(s, 5).pixels))).toBe(true); // deterministic
  });
  it("an identity camera ({}) is byte-identical to no camera", () => {
    const without = renderFrame(scene(), 0);
    const identity = renderFrame(scene({}), 0);
    expect(Buffer.from(without.pixels).equals(Buffer.from(identity.pixels))).toBe(true);
  });
});
