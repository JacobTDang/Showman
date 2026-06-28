import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildBarGraph } from "../../src/math/barGraph.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 400, h = 260): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

describe("bar graph", () => {
  const bars = [
    { label: "Cats", value: 3, color: "#ff0000" },
    { label: "Dogs", value: 5, color: "#00ff00" },
    { label: "Birds", value: 2, color: "#0000ff" },
  ];

  it("builds a valid scene", () => {
    const g = buildBarGraph({ id: "bg", x: 20, y: 20, width: 360, height: 220, bars });
    expect(validateScene(scene([g])).valid).toBe(true);
  });

  it("has exactly bars.length rect children (the bars)", () => {
    const g = buildBarGraph({ id: "bg", bars });
    const rects = g.children.filter((c) => c.type === "rect");
    expect(rects.length).toBe(bars.length);
  });

  it("scales heights against maxValue (tallest = full plot height)", () => {
    const g = buildBarGraph({ id: "bg", height: 220, bars });
    const rects = g.children.filter((c): c is Extract<Node, { type: "rect" }> => c.type === "rect");
    const tallest = rects[1]!; // Dogs = 5 is the max
    const shortest = rects[2]!; // Birds = 2
    expect(tallest.height ?? 0).toBeGreaterThan(shortest.height ?? 0);
    // value=2 against max=5 is 2/5 of the tallest bar.
    expect((shortest.height ?? 0) / (tallest.height ?? 1)).toBeCloseTo(2 / 5, 5);
  });

  it("respects an explicit maxValue", () => {
    const g = buildBarGraph({ id: "bg", height: 220, maxValue: 10, bars });
    const rects = g.children.filter((c): c is Extract<Node, { type: "rect" }> => c.type === "rect");
    const tallest = rects[1]!; // value 5 against max 10 => half height
    expect(tallest.height ?? 0).toBeGreaterThan(0);
    expect(tallest.height ?? 0).toBeLessThan(220);
  });

  it("renders each bar's interior in its color", () => {
    const ox = 20;
    const oy = 20;
    const g = buildBarGraph({ id: "bg", x: ox, y: oy, width: 360, height: 220, bars });
    const spec = scene([g]);
    expect(validateScene(spec).valid).toBe(true);
    const frame = renderFrame(spec, 0);
    const rects = g.children.filter((c): c is Extract<Node, { type: "rect" }> => c.type === "rect");

    const targets = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
    ];
    rects.forEach((rect, i) => {
      // sample the bar's interior center (group origin + local bar center)
      const px = Math.round(ox + (rect.x ?? 0) + (rect.width ?? 0) / 2);
      const py = Math.round(oy + (rect.y ?? 0) + (rect.height ?? 0) / 2);
      expect(isColorNear(samplePixel(frame, px, py), targets[i]!)).toBe(true);
    });
  });
});
