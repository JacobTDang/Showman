import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildNumberLineFraction } from "../../src/math/numberLineFraction.js";
import { getTheme } from "../../src/theme/themes.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 400, h = 140): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

/** Parse a `#rrggbb` hex into an rgb target for `isColorNear`. */
function hexRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

describe("number-line fraction", () => {
  it("builds a valid scene", () => {
    const nl = buildNumberLineFraction({ id: "nl", x: 20, y: 70, numerator: 3, denominator: 4 });
    expect(validateScene(scene([nl])).valid).toBe(true);
  });

  it("contains a base line + a highlight polyline + a marker ellipse", () => {
    const theme = getTheme();
    const nl = buildNumberLineFraction({ id: "nl", x: 20, y: 70, numerator: 3, denominator: 4, width: 360 });

    const polylines = nl.children.filter((n) => n.type === "polyline");
    const ellipses = nl.children.filter((n) => n.type === "ellipse");

    // Exactly one marker dot.
    expect(ellipses.length).toBe(1);

    // Base line: a full-width polyline stroked with the text color.
    const baseLine = polylines.find((p) => p.type === "polyline" && p.stroke === theme.palette.text && p.points[1]!.x === 360);
    expect(baseLine).toBeDefined();

    // Highlight: a thicker polyline stroked with the primary color.
    const highlight = polylines.find((p) => p.type === "polyline" && p.stroke === theme.palette.primary);
    expect(highlight).toBeDefined();
    // 3/4 of the 360px line.
    if (highlight && highlight.type === "polyline") {
      expect(highlight.points[1]!.x).toBeCloseTo(270, 5);
    }
  });

  it("draws the highlight in primary and the marker in secondary", () => {
    const gx = 20;
    const gy = 70;
    const width = 360;
    const nl = buildNumberLineFraction({ id: "nl", x: gx, y: gy, numerator: 3, denominator: 4, width });
    const spec = scene([nl]);
    expect(validateScene(spec).valid).toBe(true);

    const f = renderFrame(spec, 0);
    const theme = getTheme();
    const primary = hexRgb(theme.palette.primary);
    const secondary = hexRgb(theme.palette.secondary);

    const markerX = gx + (3 / 4) * width; // 290

    // A point along the highlighted segment (midpoint, away from any tick) reads primary (a stroke, exact).
    expect(isColorNear(samplePixel(f, gx + 135, gy), primary)).toBe(true);
    // depth: the marker dot is a sphere — a chip gradient fading to the exact secondary.
    const marker = nl.children.find((n) => n.type === "ellipse") as { gradient?: { stops: { color: string }[] } };
    expect(marker.gradient?.stops.at(-1)?.color).toBe(theme.palette.secondary);
    // The marker dot center reads secondary (the chip lightens it a touch).
    expect(isColorNear(samplePixel(f, markerX, gy), secondary, 40)).toBe(true);
    // Above the line beyond the marker stays white background.
    expect(isColorNear(samplePixel(f, gx + width - 10, gy - 30), { r: 255, g: 255, b: 255 })).toBe(true);
  });

  it("handles degenerate input (denominator:0, NaN/negative options) without dividing by zero", () => {
    const nl = buildNumberLineFraction({
      id: "nl",
      x: Number.NaN,
      y: 70,
      numerator: Number.POSITIVE_INFINITY,
      denominator: 0,
      width: -50,
      whole: Number.NaN,
    });
    const spec = scene([nl]);
    expect(validateScene(spec).valid).toBe(true);
    // Still exactly one marker ellipse, and every polyline has finite points.
    expect(nl.children.filter((n) => n.type === "ellipse").length).toBe(1);
    for (const child of nl.children) {
      if (child.type === "polyline") {
        for (const p of child.points) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
      }
    }
  });
});
