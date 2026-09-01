import { describe, expect, it } from "vitest";
import { fitAuthoredText, measureBoxForTest } from "../../src/authoring/textFit.js";
import { AuthoringAgent, ScriptedAuthor } from "../../src/authoring/agent.js";
import { validateScene } from "../../src/index.js";

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

  // An absolute margin is nonsense on a small canvas -- 16px each side of a 64px-wide
  // scene reserves half of it. The margin scales down with the frame.
  it("scales its edge margin to a small canvas", () => {
    const spec = {
      specVersion: 1,
      width: 64,
      height: 64,
      fps: 30,
      duration: 2,
      background: "#ffffff",
      nodes: [{ id: "topic", type: "text", text: "resistor", x: 2, y: 2, fontSize: 8 }],
    };
    const before = JSON.stringify(spec);
    const result = fitAuthoredText(spec);
    expect(result.repairs).toEqual([]);
    expect(JSON.stringify(result.spec)).toBe(before);
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

describe("fitAuthoredText — label collisions", () => {
  const overlaps = (a: Box, b: Box) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) >= 2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) >= 2;

  it("separates two labels sitting at identical coordinates", () => {
    const spec = base([
      { id: "a", type: "text", text: "12V AC Input", x: 400, y: 300, fontSize: 28 },
      { id: "b", type: "text", text: "Diode (0.7V drop)", x: 400, y: 300, fontSize: 28 },
    ]);
    const out = fitAuthoredText(spec).spec;
    expect(overlaps(boxOf(out, "a"), boxOf(out, "b"))).toBe(false);
  });

  it("keeps the separated label on the canvas", () => {
    const spec = base([
      { id: "a", type: "text", text: "12V AC Input", x: 400, y: 690, fontSize: 28 },
      { id: "b", type: "text", text: "Diode (0.7V drop)", x: 400, y: 690, fontSize: 28 },
    ]);
    const out = fitAuthoredText(spec).spec;
    for (const id of ["a", "b"]) {
      const box = boxOf(out, id);
      expect(box.y0).toBeGreaterThanOrEqual(0);
      expect(box.y1).toBeLessThanOrEqual(720);
    }
  });

  it("moves the later node, not the earlier one", () => {
    const spec = base([
      { id: "a", type: "text", text: "first", x: 400, y: 300, fontSize: 28 },
      { id: "b", type: "text", text: "second", x: 400, y: 300, fontSize: 28 },
    ]);
    const out = fitAuthoredText(spec).spec as { nodes: Array<Record<string, unknown>> };
    expect(out.nodes[0]!["x"]).toBe(400);
    expect(out.nodes[0]!["y"]).toBe(300);
    expect(out.nodes[1]!["y"]).not.toBe(300);
  });

  it("leaves labels that merely sit near each other alone", () => {
    const spec = base([
      { id: "a", type: "text", text: "left", x: 200, y: 300, fontSize: 24 },
      { id: "b", type: "text", text: "right", x: 800, y: 300, fontSize: 24 },
    ]);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  // Pushing down is the first choice, but near the bottom edge the clamp drags the node
  // straight back into the collision. Try the other direction before giving up.
  it("pushes the other way when the preferred direction is against an edge", () => {
    const spec = base([
      { id: "a", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" },
      {
        id: "b",
        type: "text",
        text: "During the negative half-cycle, the diode blocks current.",
        x: 300,
        y: 600,
        fontSize: 28,
        align: "center",
      },
    ]);
    const out = fitAuthoredText(spec).spec;
    expect(overlaps(boxOf(out, "a"), boxOf(out, "b"))).toBe(false);
    const box = boxOf(out, "b");
    expect(box.y0).toBeGreaterThanOrEqual(0);
    expect(box.y1).toBeLessThanOrEqual(720);
  });

  it("stays idempotent once labels are separated", () => {
    const spec = base([
      { id: "a", type: "text", text: "12V AC Input", x: 400, y: 300, fontSize: 28 },
      { id: "b", type: "text", text: "Diode (0.7V drop)", x: 400, y: 300, fontSize: 28 },
    ]);
    const once = fitAuthoredText(spec).spec;
    expect(fitAuthoredText(once).repairs).toEqual([]);
  });
});

describe("authoring loop reports text fixes", () => {
  /** Minimal ShowmanClient: real validation, no rendering. */
  const stubClient = () =>
    ({
      getSchema: async () => ({}) as never,
      validate: async (spec: unknown) => validateScene(spec as never),
      preview: async () => ({ ok: true, errors: [] }),
      submit: async () => ({ ok: true, jobId: "job-1", errors: [] }),
    }) as never;

  it("fits authored text and records the repair", async () => {
    const spec = base([{ id: "n", type: "text", text: NARRATION, x: 300, y: 600, fontSize: 28, align: "center" }]);
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([spec]));
    const result = await agent.authorSpec("the diode during the positive half-cycle");

    expect(result.ok).toBe(true);
    expect(result.history.at(-1)?.repaired?.join(" ")).toMatch(/wrapped|moved/);
    expect((result.spec as unknown as { nodes: Array<Record<string, unknown>> }).nodes[0]!["maxWidth"]).toBeGreaterThan(0);
  });

  it("leaves a spec that already fits without recording repairs", async () => {
    const spec = base([{ id: "n", type: "text", text: "Hi", x: 640, y: 360, fontSize: 28, align: "center" }]);
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([spec]));
    const result = await agent.authorSpec("hi");

    expect(result.ok).toBe(true);
    expect(result.history.at(-1)?.repaired).toBeUndefined();
  });
});
