import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { drawOn, shadeIn, countUp, hop, fillStagger } from "../../src/math/presets.js";
import { coordinatePlane, plotLine, plotFunction, plotPoints, numberLine, fractionCircle, fractionBar } from "../../src/math/builders.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 400, h = 300): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

describe("math motion presets", () => {
  it("drawOn animates progress 0 → 1", () => {
    const t = drawOn({ start: 0, duration: 1 })[0]!;
    expect(t.property).toBe("progress");
    expect(t.keyframes[0]!.value).toBe(0);
    expect(t.keyframes[t.keyframes.length - 1]!.value).toBe(1);
  });
  it("countUp animates value to the target", () => {
    const t = countUp({ to: 10 })[0]!;
    expect(t.property).toBe("value");
    expect(t.keyframes[t.keyframes.length - 1]!.value).toBe(10);
  });
  it("shadeIn animates endAngle", () => {
    const t = shadeIn({ to: 270 })[0]!;
    expect(t.property).toBe("endAngle");
    expect(t.keyframes[t.keyframes.length - 1]!.value).toBe(270);
  });
  it("hop emits an x track and a parabolic y track", () => {
    const tracks = hop({ fromX: 0, toX: 100, baseY: 50, height: 30 });
    const x = tracks.find((t) => t.property === "x")!;
    const y = tracks.find((t) => t.property === "y")!;
    expect(x.keyframes[x.keyframes.length - 1]!.value).toBe(100);
    expect(y.keyframes[1]!.value as number).toBeLessThan(50); // dips up at the midpoint
  });
  it("fillStagger shifts each item's start", () => {
    const groups = fillStagger(3, { step: 0.2 });
    expect(groups.map((g) => g[0]!.keyframes[0]!.t)).toEqual([0, 0.2, 0.4]);
  });
});

describe("coordinate plane + graphing", () => {
  const plane = coordinatePlane({ id: "p", x: 0, y: 0, width: 300, height: 240, xMin: -5, xMax: 5, yMin: -5, yMax: 5 });

  it("maps data coords to local pixels", () => {
    expect(plane.toLocal(-5, -5)).toEqual({ x: 0, y: 240 });
    expect(plane.toLocal(5, 5)).toEqual({ x: 300, y: 0 });
    expect(plane.toLocal(0, 0)).toEqual({ x: 150, y: 120 });
  });

  it("produces a valid scene with a line and a parabola", () => {
    const line = plotLine(plane, { m: 1, b: 0 });
    const parab = plotFunction(plane, (x) => 0.2 * x * x - 2);
    const pts = plotPoints(plane, [{ x: 2, y: 2, label: "(2,2)" }]);
    const spec = scene([plane.node, line, parab, ...pts]);
    expect(validateScene(spec).valid).toBe(true);
    expect(parab.points.length).toBeGreaterThan(10); // sampled curve
    expect(line.points.length).toBeGreaterThanOrEqual(2); // a drawable segment (finely sampled, clipped to the box)
  });

  it("a plotted line actually draws on the plane", () => {
    // y = 0 line across the middle (local y = 120).
    const line = plotLine(plane, { m: 0, b: 0 }, { stroke: "red", strokeWidth: 4 });
    const f = renderFrame(scene([line]), 0);
    expect(isColorNear(samplePixel(f, 150, 120), { r: 255, g: 0, b: 0 })).toBe(true);
  });

  it("samples land on the plane's toLocal mapping", () => {
    // Parabola vertex y = 0.2x² − 2 at x=0 is (0, −2) → local (150, 168).
    const parab = plotFunction(plane, (x) => 0.2 * x * x - 2);
    const vertex = parab.points.find((p) => Math.abs(p.x - 150) < 1e-6);
    expect(vertex).toBeDefined();
    expect(vertex!.y).toBeCloseTo(plane.toLocal(0, -2).y); // 168
    // y = x crosses the origin at (0,0) → local (150, 120).
    const line = plotLine(plane, { m: 1, b: 0 });
    const mid = line.points.find((p) => Math.abs(p.x - 150) < 1e-6);
    expect(mid).toBeDefined();
    expect(mid!.y).toBeCloseTo(plane.toLocal(0, 0).y); // 120
  });

  it("degrades an out-of-range curve to finite fallback points (never NaN)", () => {
    // Entirely above yMax: every sample clamps to the top edge — finite, not dropped.
    const clamped = plotFunction(plane, () => 1000);
    expect(clamped.points.length).toBeGreaterThanOrEqual(2);
    expect(clamped.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    // Entirely non-finite: falls back to a minimal 2-point flat segment.
    const allNaN = plotFunction(plane, () => NaN);
    expect(allNaN.points.length).toBe(2);
    expect(allNaN.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it("plotPoints places an ellipse at the mapped data coordinate", () => {
    const [ellipse] = plotPoints(plane, [{ x: 2, y: 2 }]);
    expect(ellipse!.type).toBe("ellipse");
    // toLocal(2,2) = (210, 72); ellipse top-left = origin + loc − radius(6).
    const loc = plane.toLocal(2, 2);
    if (ellipse!.type === "ellipse") {
      expect(ellipse.x).toBeCloseTo(plane.originX + loc.x - 6); // 204
      expect(ellipse.y).toBeCloseTo(plane.originY + loc.y - 6); // 66
    }
  });
});

describe("number line", () => {
  it("maps values to local x", () => {
    const nl = numberLine({ from: 0, to: 10, width: 200 });
    expect(nl.toX(0)).toBe(0);
    expect(nl.toX(10)).toBe(200);
    expect(nl.toX(5)).toBe(100);
  });
  it("builds a valid scene", () => {
    const nl = numberLine({ from: 0, to: 5, width: 300, x: 20, y: 40 });
    expect(validateScene(scene([nl.node])).valid).toBe(true);
  });
});

describe("fractions", () => {
  it("fractionCircle builds a valid scene and fills the numerator", () => {
    const fc = fractionCircle({ id: "fc", x: 0, y: 0, radius: 50, numerator: 1, denominator: 4, fill: "red" });
    const spec = scene([fc], 100, 100);
    expect(validateScene(spec).valid).toBe(true);
    // 1/4 fills the top-right wedge.
    expect(isColorNear(samplePixel(renderFrame(spec, 0), 65, 35), { r: 255, g: 0, b: 0 })).toBe(true);
  });

  it("fractionBar fills the first `numerator` cells", () => {
    const fb = fractionBar({ id: "fb", x: 0, y: 0, width: 100, height: 40, numerator: 2, denominator: 4, fill: "red" });
    const spec = scene([fb], 100, 40);
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    expect(isColorNear(samplePixel(f, 12, 20), { r: 255, g: 0, b: 0 })).toBe(true); // cell 0 filled
    expect(isColorNear(samplePixel(f, 87, 20), { r: 255, g: 255, b: 255 })).toBe(true); // cell 3 empty
  });
});
