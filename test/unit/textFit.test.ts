import { describe, expect, it } from "vitest";
import { fitAuthoredText, measureBoxForTest } from "../../src/authoring/textFit.js";

const base = (nodes: unknown[]) => ({
  specVersion: 1,
  width: 1280,
  height: 720,
  fps: 30,
  duration: 5,
  background: "#ffffff",
  nodes,
});

/** The exact line from issue #124: 757.6px at 28px Nunito, centred at x=300. */
const NARRATION = "During the positive half-cycle, the diode allows current to flow.";

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where a text node's box lands, using the same measurement the pass uses. */
function boxOf(spec: unknown, id: string): Box {
  const box = measureBoxForTest(spec, id);
  if (!box) throw new Error(`no measurable text node "${id}"`);
  return box;
}

describe("fitAuthoredText — canvas containment", () => {
  it("leaves a spec whose text already fits byte-identical", () => {
    const spec = base([{ id: "t", type: "text", text: "Hi", x: 640, y: 360, fontSize: 28, align: "center" }]);
    const before = JSON.stringify(spec);
    const result = fitAuthoredText(spec);
    expect(result.repairs).toEqual([]);
    expect(JSON.stringify(result.spec)).toBe(before);
  });

  it("wraps the issue's narration line so it stops running off the left edge", () => {
    const spec = base([{ id: "n", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }]);
    const out = fitAuthoredText(spec).spec as { nodes: Array<Record<string, unknown>> };
    expect(out.nodes[0]!["maxWidth"]).toBeGreaterThan(0);
    const box = boxOf(out, "n");
    expect(box.x0).toBeGreaterThanOrEqual(0);
    expect(box.x1).toBeLessThanOrEqual(1280);
  });

  it("reports what it did", () => {
    const spec = base([{ id: "n", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }]);
    const { repairs } = fitAuthoredText(spec);
    expect(repairs.length).toBeGreaterThan(0);
    expect(repairs.join(" ")).toMatch(/wrapped|moved/);
  });

  it("clamps a node parked far outside the canvas back inside", () => {
    const spec = base([{ id: "far", type: "text", text: "off in the weeds", x: -4000, y: 900, fontSize: 24 }]);
    const out = fitAuthoredText(spec).spec;
    const box = boxOf(out, "far");
    expect(box.x0).toBeGreaterThanOrEqual(0);
    expect(box.y1).toBeLessThanOrEqual(720);
  });

  it("is idempotent", () => {
    const spec = base([{ id: "n", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }]);
    const once = fitAuthoredText(spec).spec;
    const twice = fitAuthoredText(once);
    expect(twice.repairs).toEqual([]);
    expect(JSON.stringify(twice.spec)).toBe(JSON.stringify(once));
  });
});

describe("fitAuthoredText — eligibility", () => {
  it("leaves a node whose x is animated untouched", () => {
    const spec = base([
      {
        id: "slide",
        type: "text",
        text: NARRATION,
        x: 300,
        y: 600,
        fontSize: 28,
        align: "center",
        tracks: [
          {
            property: "x",
            keyframes: [
              { t: 0, value: -800 },
              { t: 1, value: 300 },
            ],
          },
        ],
      },
    ]);
    const before = JSON.stringify(spec);
    const result = fitAuthoredText(spec);
    expect(result.repairs).toEqual([]);
    expect(JSON.stringify(result.spec)).toBe(before);
  });

  it("leaves a node under a rotated group untouched", () => {
    const spec = base([
      {
        id: "g",
        type: "group",
        x: 0,
        y: 0,
        rotation: 12,
        children: [{ id: "t", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }],
      },
    ]);
    const before = JSON.stringify(spec);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
    expect(JSON.stringify(fitAuthoredText(spec).spec)).toBe(before);
  });

  it("leaves a spec that declares a camera untouched", () => {
    const spec = {
      ...base([{ id: "n", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }]),
      camera: { x: 0, y: 0, zoom: 2 },
    };
    const before = JSON.stringify(spec);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
    expect(JSON.stringify(fitAuthoredText(spec).spec)).toBe(before);
  });

  it("still fits a node that only animates opacity", () => {
    const spec = base([
      {
        id: "fade",
        type: "text",
        text: NARRATION,
        x: 300,
        y: 600,
        fontSize: 28,
        align: "center",
        tracks: [
          {
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 1, value: 1 },
            ],
          },
        ],
      },
    ]);
    expect(fitAuthoredText(spec).repairs.length).toBeGreaterThan(0);
  });

  it("skips malformed nodes without throwing", () => {
    const spec = base([
      null,
      { id: "no-text", type: "text", x: 10, y: 10 },
      { id: "bad-x", type: "text", text: "hi", x: "nope", y: 10 },
      "junk",
    ]);
    expect(() => fitAuthoredText(spec)).not.toThrow();
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  it("returns a non-object spec untouched", () => {
    expect(fitAuthoredText(null).spec).toBeNull();
    expect(fitAuthoredText(42).repairs).toEqual([]);
  });
});
