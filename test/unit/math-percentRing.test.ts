import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildPercentRing } from "../../src/math/percentRing.js";
import { getTheme } from "../../src/theme/themes.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 300, h = 220): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

/** Parse a `#rrggbb` hex into an rgb target for `isColorNear`. */
function hexRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

describe("percent ring", () => {
  it("builds a valid scene", () => {
    const ring = buildPercentRing({ id: "pr", x: 20, y: 20, percent: 75 });
    expect(validateScene(scene([ring])).valid).toBe(true);
  });

  it("has exactly 2 arc children and 1 counter", () => {
    const ring = buildPercentRing({ id: "pr", percent: 75 });
    const arcs = ring.children.filter((n) => n.type === "arc");
    const counters = ring.children.filter((n) => n.type === "counter");
    expect(arcs.length).toBe(2);
    expect(counters.length).toBe(1);
  });

  it("paints the filled arc band with the fill (accent) color", () => {
    const radius = 80;
    const thickness = 22;
    const ring = buildPercentRing({ id: "pr", x: 20, y: 20, percent: 75, radius, thickness });
    const spec = scene([ring]);
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);

    // Ring center in scene coords = group(20,20) + local center(radius,radius).
    const cx = 20 + radius;
    const cy = 20 + radius;
    // Mid-band radius, sampled at 3 o'clock (90deg clockwise from top) — inside the
    // 75% (270deg) clockwise sweep, so it reads as the filled accent color.
    const midR = (radius - thickness + radius) / 2; // (inner + outer) / 2 = 69
    const accent = hexRgb(getTheme().palette.accent);
    expect(isColorNear(samplePixel(f, cx + midR, cy), accent)).toBe(true);
  });

  it("stays valid for degenerate percents (NaN, out-of-range)", () => {
    expect(validateScene(scene([buildPercentRing({ id: "pr", percent: NaN })])).valid).toBe(true);
    expect(validateScene(scene([buildPercentRing({ id: "pr2", percent: 150 })])).valid).toBe(true);
    // Degenerate radius/thickness must not emit a non-finite or negative dimension.
    expect(validateScene(scene([buildPercentRing({ id: "pr3", percent: 50, radius: -5, thickness: 9e9 })])).valid).toBe(true);
  });
});
