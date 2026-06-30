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

  it("sizes segment widths proportionally to their values and tiles the full bar", () => {
    const W = 300;
    const tape = buildTapeDiagram({ id: "t", width: W, segments: [{ value: 2 }, { value: 1 }] });
    const rects = tape.children.filter((c) => c.type === "rect");
    const w = (n: (typeof rects)[number]): number => (n.type === "rect" ? (n.width ?? NaN) : NaN);
    expect(w(rects[0]!)).toBeCloseTo((2 / 3) * W); // 200
    expect(w(rects[1]!)).toBeCloseTo((1 / 3) * W); // 100
    // No gaps/padding: the parts exactly cover the bar width.
    expect(w(rects[0]!) + w(rects[1]!)).toBeCloseTo(W);
    // …and they sit edge-to-edge (segment 1 starts where segment 0 ends).
    const x = (n: (typeof rects)[number]): number => (n.type === "rect" ? (n.x ?? NaN) : NaN);
    expect(x(rects[0]!)).toBeCloseTo(0);
    expect(x(rects[1]!)).toBeCloseTo((2 / 3) * W);
  });

  it("falls back to an equal split when the values sum to zero", () => {
    const W = 200;
    const tape = buildTapeDiagram({ id: "t", width: W, segments: [{ value: 0 }, { value: 0 }] });
    const rects = tape.children.filter((c) => c.type === "rect");
    const w = (n: (typeof rects)[number]): number => (n.type === "rect" ? (n.width ?? NaN) : NaN);
    expect(rects.length).toBe(2);
    expect(w(rects[0]!)).toBeCloseTo(W / 2);
    expect(w(rects[1]!)).toBeCloseTo(W / 2);
  });

  it("handles single and empty segment lists", () => {
    const single = buildTapeDiagram({ id: "s", width: 200, segments: [{ value: 5 }] });
    const sRects = single.children.filter((c) => c.type === "rect");
    expect(sRects.length).toBe(1);
    const sw = sRects[0]!.type === "rect" ? sRects[0]!.width : NaN;
    expect(sw).toBeCloseTo(200); // a lone segment spans the whole bar

    const empty = buildTapeDiagram({ id: "e", segments: [] });
    expect(empty.children.filter((c) => c.type === "rect").length).toBe(0);
    expect(validateScene(scene([empty])).valid).toBe(true);
  });
});
