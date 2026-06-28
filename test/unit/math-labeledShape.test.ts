import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildLabeledShape } from "../../src/math/labeledShape.js";
import { getTheme } from "../../src/theme/themes.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 360, h = 360): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

/** Parse a `#rrggbb` hex into an rgb target for `isColorNear`. */
function hexRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

describe("labeled shape", () => {
  it("builds a valid scene", () => {
    const s = buildLabeledShape({ id: "ls", x: 120, y: 120, sides: 5 });
    expect(validateScene(scene([s])).valid).toBe(true);
  });

  it("has exactly 1 polygon and `sides` vertex-label text nodes", () => {
    const s = buildLabeledShape({ id: "ls", sides: 5 });
    const polys = s.children.filter((n) => n.type === "polygon");
    const texts = s.children.filter((n) => n.type === "text");
    expect(polys.length).toBe(1);
    expect(texts.length).toBe(5);
  });

  it("adds side labels and an angle arc when requested", () => {
    const s = buildLabeledShape({ id: "ls", sides: 4, sideLabel: "5 cm", showAngle: true });
    // 4 vertex labels + 4 side labels.
    expect(s.children.filter((n) => n.type === "text").length).toBe(8);
    expect(s.children.filter((n) => n.type === "arc").length).toBe(1);
    expect(validateScene(scene([s])).valid).toBe(true);
  });

  it("fills the polygon interior with the secondary color", () => {
    const radius = 90;
    const s = buildLabeledShape({ id: "ls", x: 120, y: 120, sides: 6, radius });
    const spec = scene([s]);
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    const secondary = hexRgb(getTheme().palette.secondary);
    // Center of the polygon: group origin (120,120) + local center (radius,radius).
    expect(isColorNear(samplePixel(f, 120 + radius, 120 + radius), secondary)).toBe(true);
  });

  it("clamps sides to >= 3 for degenerate input (sides:1) and stays valid", () => {
    const s = buildLabeledShape({ id: "ls", x: 120, y: 120, sides: 1 });
    const poly = s.children.find((n) => n.type === "polygon");
    expect(poly && poly.type === "polygon" && (poly.sides ?? 0) >= 3).toBe(true);
    expect(s.children.filter((n) => n.type === "text").length).toBe(3);
    expect(validateScene(scene([s])).valid).toBe(true);
  });

  it("survives NaN/negative options and still validates", () => {
    const s = buildLabeledShape({
      id: "ls",
      x: Number.NaN,
      y: Number.POSITIVE_INFINITY,
      sides: Number.NaN,
      radius: -50,
    });
    const poly = s.children.find((n) => n.type === "polygon");
    expect(poly && poly.type === "polygon" && (poly.sides ?? 0) >= 3).toBe(true);
    expect(validateScene(scene([s])).valid).toBe(true);
  });
});
