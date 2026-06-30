import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildTenFrame } from "../../src/math/tenFrame.js";
import { getTheme } from "../../src/theme/themes.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 300, h = 120): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

/** Parse a `#rrggbb` hex into an rgb target for `isColorNear`. */
function hexRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

describe("ten-frame", () => {
  it("builds a valid scene", () => {
    const tf = buildTenFrame({ id: "tf", x: 0, y: 0, filled: 3 });
    expect(validateScene(scene([tf])).valid).toBe(true);
  });

  it("has exactly `filled` ellipse counters", () => {
    const tf = buildTenFrame({ id: "tf", filled: 3 });
    const ellipses = tf.children.filter((n) => n.type === "ellipse");
    expect(ellipses.length).toBe(3);
  });

  it("fills the first cells with the primary color and leaves the rest white", () => {
    const cell = 48;
    const tf = buildTenFrame({ id: "tf", x: 0, y: 0, filled: 3, cellSize: cell });
    const spec = scene([tf]);
    expect(validateScene(spec).valid).toBe(true);
    // depth: each counter is a sphere — a radial chip gradient fading to the exact primary token.
    const counter = tf.children.find((n) => n.type === "ellipse") as { gradient?: { stops: { color: string }[] } };
    expect(counter.gradient?.stops.at(-1)?.color).toBe(getTheme().palette.primary);
    const f = renderFrame(spec, 0);
    const primary = hexRgb(getTheme().palette.primary);

    // Cell 0 (filled) — center reads as a (highlighted) shade of the primary token, clearly not white.
    expect(isColorNear(samplePixel(f, cell / 2, cell / 2), primary, 45)).toBe(true);
    // Cell 9 (last, empty) — center stays white.
    expect(isColorNear(samplePixel(f, 4 * cell + cell / 2, cell + cell / 2), { r: 255, g: 255, b: 255 })).toBe(true);
  });
});
