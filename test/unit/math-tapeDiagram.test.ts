import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildTapeDiagram } from "../../src/math/tapeDiagram.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 400, h = 200): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

describe("tape diagram", () => {
  it("builds a valid scene with one rect per segment and proportional colors", () => {
    const tape = buildTapeDiagram({
      id: "t",
      x: 20,
      y: 20,
      width: 300,
      height: 56,
      totalLabel: "3",
      segments: [
        { value: 2, label: "A", color: "#e63946" },
        { value: 1, label: "B", color: "#457b9d" },
      ],
    });
    const spec = scene([tape]);
    expect(validateScene(spec).valid).toBe(true);

    // Exactly segments.length rect children.
    const rects = tape.children.filter((c) => c.type === "rect");
    expect(rects.length).toBe(2);

    const f = renderFrame(spec, 0);
    // First segment (2/3 of the bar) is wide and red on the left.
    expect(isColorNear(samplePixel(f, 40, 90), { r: 230, g: 57, b: 70 })).toBe(true);
    // Second segment (1/3) is blue on the right.
    expect(isColorNear(samplePixel(f, 300, 90), { r: 69, g: 123, b: 157 })).toBe(true);
  });

  it("uses theme swatches and defaults when colors/labels are omitted", () => {
    const tape = buildTapeDiagram({
      segments: [{ value: 1 }, { value: 1 }, { value: 1 }],
    });
    const spec = scene([tape]);
    expect(validateScene(spec).valid).toBe(true);
    expect(tape.children.filter((c) => c.type === "rect").length).toBe(3);
  });

  it("is a pure function of its options", () => {
    const opts = { id: "p", segments: [{ value: 3 }, { value: 5 }], totalLabel: "8" };
    expect(JSON.stringify(buildTapeDiagram({ ...opts }))).toBe(JSON.stringify(buildTapeDiagram({ ...opts })));
  });
});
