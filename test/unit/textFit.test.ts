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

/** Do two boxes overlap by enough to read as a collision? */
const overlaps = (a: Box, b: Box) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) >= 2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) >= 2;

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

// Issue #128: a label may still be drawn on top of the artwork it annotates. The test
// is legibility, not geometry -- a label centred inside its own shape is a deliberate
// idiom, a label lying across a shape's edge is an accident.
describe("fitAuthoredText — artwork occlusion", () => {
  /** An op-amp body: a filled triangle spanning 600..720 x 300..420. */
  const opAmpBody = (over: Record<string, unknown> = {}) => ({
    id: "body",
    type: "polygon",
    x: 600,
    y: 300,
    sides: 3,
    radius: 60,
    fill: "#bfdbfe",
    ...over,
  });
  /** "Output (Vout)" at 24px, centred on that body: box 588.2..731.8 x 348..372. */
  const outputLabel = (over: Record<string, unknown> = {}) => ({
    id: "l",
    type: "text",
    text: "Output (Vout)",
    x: 660,
    y: 360,
    fontSize: 24,
    fill: "#0f172a",
    align: "center",
    baseline: "middle",
    ...over,
  });

  it("moves a label that lies across the component it labels", () => {
    const spec = base([opAmpBody(), outputLabel()]);
    const result = fitAuthoredText(spec);
    // Clear of the body's 300..420 band, and pushed below it rather than above.
    expect(boxOf(result.spec, "l").y0).toBeGreaterThanOrEqual(420);
    expect(result.repairs.join(" ")).toMatch(/clear of shape "body"/);
  });

  it("leaves the artwork itself where the author put it", () => {
    const out = fitAuthoredText(base([opAmpBody(), outputLabel()])).spec as { nodes: Array<Record<string, unknown>> };
    expect(out.nodes[0]!["x"]).toBe(600);
    expect(out.nodes[0]!["y"]).toBe(300);
  });

  it("leaves a label deliberately centred inside its own shape alone", () => {
    const spec = base([
      { id: "card", type: "rect", x: 560, y: 330, width: 200, height: 60, radius: 8, fill: "#bfdbfe" },
      { id: "l", type: "text", text: "Amplifier", x: 660, y: 360, fontSize: 20, fill: "#0f172a", align: "center", baseline: "middle" },
    ]);
    const before = JSON.stringify(spec);
    const result = fitAuthoredText(spec);
    expect(result.repairs).toEqual([]);
    expect(JSON.stringify(result.spec)).toBe(before);
  });

  it("reports a centred label that is illegible on the fill under it", () => {
    const spec = base([
      { id: "card", type: "rect", x: 560, y: 330, width: 200, height: 60, fill: "#334155" },
      { id: "l", type: "text", text: "Amplifier", x: 660, y: 360, fontSize: 20, fill: "#1e293b", align: "center", baseline: "middle" },
    ]);
    const result = fitAuthoredText(spec);
    expect(result.repairs.join(" ")).toMatch(/reads at 1\.\d+:1 against shape "card"/);
    // Reported, not moved: the placement is deliberate and the fix is a colour, not a nudge.
    expect(boxOf(result.spec, "l").y0).toBe(350);
  });

  it("does not report a centred label that reads fine on its shape", () => {
    const spec = base([
      { id: "card", type: "rect", x: 560, y: 330, width: 200, height: 60, fill: "#334155" },
      { id: "l", type: "text", text: "Amplifier", x: 660, y: 360, fontSize: 20, fill: "#ffffff", align: "center", baseline: "middle" },
    ]);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  // A backing pill sized by eye often ends up a few pixels short of the label it sits
  // behind. Dragging the label off it would be the worse picture, so "across" needs a
  // real share of the label on BOTH sides of the edge.
  it("leaves a label that only overhangs its own backing shape", () => {
    const spec = base([{ id: "pill", type: "rect", x: 600, y: 340, width: 125, height: 40, fill: "#bfdbfe" }, outputLabel()]);
    const before = JSON.stringify(spec);
    const result = fitAuthoredText(spec);
    expect(result.repairs).toEqual([]);
    expect(JSON.stringify(result.spec)).toBe(before);
    // The same shape slid along until the label genuinely straddles its edge is moved.
    const across = base([{ id: "pill", type: "rect", x: 660, y: 340, width: 125, height: 40, fill: "#bfdbfe" }, outputLabel()]);
    expect(fitAuthoredText(across).repairs.join(" ")).toMatch(/clear of shape "pill"/);
  });

  it("ignores an unfilled outline — line art hides nothing", () => {
    const spec = base([opAmpBody({ fill: "none", stroke: "#334155", strokeWidth: 3 }), outputLabel()]);
    const before = JSON.stringify(spec);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
    expect(JSON.stringify(fitAuthoredText(spec).spec)).toBe(before);
  });

  it("ignores a shape whose fill is the background — it paints no visible ground", () => {
    const spec = base([opAmpBody({ fill: "#ffffff" }), outputLabel()]);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  it("ignores a shape the label merely grazes", () => {
    // The label's box is 588.2..731.8; this rect starts at 720, so it takes one of the
    // seven sampled columns -- a real overlap, but not enough to hide the label.
    const spec = base([{ id: "r", type: "rect", x: 720, y: 300, width: 100, height: 200, fill: "#bfdbfe" }, outputLabel()]);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  it("judges an ellipse by the ellipse, not by its bounding box", () => {
    // The circle is centred (700,440) r=100. "Start" at (615,358) covers 80% of the
    // bounding box's top-left corner but almost none of the circle itself.
    const circle = { id: "c", type: "ellipse", x: 600, y: 340, width: 200, height: 200, fill: "#bfdbfe" };
    const label = (x: number, y: number) => ({
      id: "l",
      type: "text",
      text: "Start",
      x,
      y,
      fontSize: 24,
      fill: "#0f172a",
      align: "center",
      baseline: "middle",
    });
    expect(fitAuthoredText(base([circle, label(615, 358)])).repairs).toEqual([]);
    // Same label, same shape, moved across the circle's left edge: this one must be
    // caught, or the corner case above would be passing for the wrong reason.
    expect(fitAuthoredText(base([circle, label(600, 440)])).repairs.join(" ")).toMatch(/clear of shape "c"/);
  });

  it("ignores a shape whose footprint is animated", () => {
    const spec = base([
      opAmpBody({
        tracks: [
          {
            property: "radius",
            keyframes: [
              { t: 0, value: 0 },
              { t: 1, value: 60 },
            ],
          },
        ],
      }),
      outputLabel(),
    ]);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  it("ignores a shape that fades — it may be gone when the label shows", () => {
    const spec = base([
      opAmpBody({
        tracks: [
          {
            property: "opacity",
            keyframes: [
              { t: 0, value: 1 },
              { t: 1, value: 0 },
            ],
          },
        ],
      }),
      outputLabel(),
    ]);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  it("ignores a shape under a group that fades", () => {
    const spec = base([
      {
        id: "beat",
        type: "group",
        x: 0,
        y: 0,
        tracks: [
          {
            property: "opacity",
            keyframes: [
              { t: 0, value: 1 },
              { t: 1, value: 0 },
            ],
          },
        ],
        children: [opAmpBody()],
      },
      outputLabel(),
    ]);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  it("accumulates ancestor transforms when placing artwork", () => {
    // The body sits at 600,300 only once the group's offset is applied.
    const spec = base([{ id: "g", type: "group", x: 500, y: 200, children: [opAmpBody({ x: 100, y: 100 })] }, outputLabel()]);
    expect(fitAuthoredText(spec).repairs.join(" ")).toMatch(/clear of shape "body"/);
  });

  // Pushing the label off the bottom of the shape would run it off the canvas, so the
  // pass has to try the other way instead of conceding.
  it("keeps a label it moves off artwork on the canvas", () => {
    const spec = base([
      { id: "body", type: "rect", x: 620, y: 600, width: 100, height: 120, fill: "#bfdbfe" },
      { id: "l", type: "text", text: "Output (Vout)", x: 660, y: 690, fontSize: 24, fill: "#0f172a", align: "center", baseline: "middle" },
    ]);
    const box = boxOf(fitAuthoredText(spec).spec, "l");
    expect(box.y0).toBeGreaterThanOrEqual(0);
    expect(box.y1).toBeLessThanOrEqual(720);
    expect(box.y1).toBeLessThanOrEqual(600);
  });

  // Separating two labels can only push one of them somewhere: the direction it picks
  // must not be onto the artwork. Here "down" runs off the canvas and "up" lands on the
  // component, so only a sideways move is acceptable.
  it("does not let label separation push a label back onto artwork", () => {
    const body = { x0: 540, y0: 560, x1: 660, y1: 680 };
    const spec = base([
      { id: "body", type: "rect", x: body.x0, y: body.y0, width: 120, height: 120, fill: "#bfdbfe" },
      { id: "a", type: "text", text: "12V AC Input", x: 600, y: 700, fontSize: 28, fill: "#0f172a", align: "center", baseline: "middle" },
      {
        id: "b",
        type: "text",
        text: "Diode (0.7V drop)",
        x: 600,
        y: 700,
        fontSize: 28,
        fill: "#0f172a",
        align: "center",
        baseline: "middle",
      },
    ]);
    const out = fitAuthoredText(spec).spec;
    for (const id of ["a", "b"]) expect(overlaps(boxOf(out, id), body)).toBe(false);
  });

  it("is idempotent once a label is clear of the artwork", () => {
    const spec = base([opAmpBody(), outputLabel()]);
    const once = fitAuthoredText(spec).spec;
    const twice = fitAuthoredText(once);
    expect(twice.repairs).toEqual([]);
    expect(JSON.stringify(twice.spec)).toBe(JSON.stringify(once));
  });

  it("leaves an image alone — only the renderer knows its natural size", () => {
    const spec = base([{ id: "img", type: "image", x: 600, y: 300, src: "data:," }, outputLabel()]);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
    // Given the size, it hides the label like anything else would.
    const sized = base([{ id: "img", type: "image", x: 600, y: 300, width: 120, height: 120, src: "data:," }, outputLabel()]);
    expect(fitAuthoredText(sized).repairs.join(" ")).toMatch(/clear of shape "img"/);
  });

  it("skips malformed artwork without throwing", () => {
    const spec = base([null, "junk", { id: "bare", type: "rect" }, { id: "typeless", x: 600, y: 300 }, outputLabel()]);
    expect(() => fitAuthoredText(spec)).not.toThrow();
    expect(fitAuthoredText(spec).repairs).toEqual([]);
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

  // A builder places its own label deliberately. The pass runs before builder expansion,
  // so it never sees that label -- this pins the ordering that makes it true, rather than
  // adding machinery to protect it. The freehand rect is positioned so that the builder's
  // label lies right across it: a pass that ran after expansion would move the label.
  it("never touches a builder's own label", async () => {
    const spec = {
      ...base([{ id: "art", type: "rect", x: 400, y: 300, width: 120, height: 120, fill: "#334155" }]),
      builders: [
        { id: "amp", builder: "diagram.box", x: 400, y: 300, params: { width: 200, height: 80, shape: "rect", label: "Amplifier" } },
      ],
    };
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([spec]));
    const result = await agent.authorSpec("amplifier");

    expect(result.ok).toBe(true);
    expect(result.history.at(-1)?.repaired).toBeUndefined();
    const group = (result.spec as unknown as { nodes: Array<Record<string, unknown>> }).nodes[1]!;
    const built = (group["children"] as Array<Record<string, unknown>>)[0]!;
    const label = (built["children"] as Array<Record<string, unknown>>).find((n) => n["type"] === "text");
    // Dead centre of the 200x80 box the builder drew.
    expect(label?.["x"]).toBe(100);
    expect(label?.["y"]).toBe(40);
  });

  it("leaves a spec that already fits without recording repairs", async () => {
    const spec = base([{ id: "n", type: "text", text: "Hi", x: 640, y: 360, fontSize: 28, align: "center" }]);
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([spec]));
    const result = await agent.authorSpec("hi");

    expect(result.ok).toBe(true);
    expect(result.history.at(-1)?.repaired).toBeUndefined();
  });
});

describe("fitAuthoredText — labels sequenced in time", () => {
  const fade = (t0: number, t1: number) => ({
    property: "opacity",
    keyframes: [
      { t: t0, value: 0 },
      { t: t0 + 0.3, value: 1 },
      { t: t1 - 0.3, value: 1 },
      { t: t1, value: 0 },
    ],
  });

  // The project's own outline lesson stacks every segment's kind label at one point and
  // sequences them by opacity. They never appear together, so there is nothing to separate.
  it("leaves the outline lesson's stacked kind labels where the template put them", async () => {
    const { lessonFromBriefOutline } = await import("../../src/authoring/templateAuthor.js");
    const spec = lessonFromBriefOutline("Ohm's law", ["Voltage pushes current", "Resistance opposes it", "Current results"]);
    const result = fitAuthoredText(spec);
    expect(result.repairs.filter((r) => r.includes("clear of"))).toEqual([]);
    const kinds = (result.spec as { nodes: Array<Record<string, unknown>> }).nodes.filter((n) => /^kind\d/.test(String(n["id"])));
    expect(new Set(kinds.map((n) => `${n["x"]},${n["y"]}`)).size).toBe(1);
  });

  it("does not separate two labels whose visibility windows are disjoint", () => {
    const spec = base([
      { id: "a", type: "text", text: "INTRO", x: 480, y: 162, fontSize: 22, align: "center", tracks: [fade(1, 4)] },
      { id: "b", type: "text", text: "CONCEPT", x: 480, y: 162, fontSize: 22, align: "center", tracks: [fade(4, 7)] },
    ]);
    const before = JSON.stringify(spec);
    const result = fitAuthoredText(spec);
    expect(result.repairs).toEqual([]);
    expect(JSON.stringify(result.spec)).toBe(before);
  });

  it("still separates two labels whose visibility windows overlap", () => {
    const spec = base([
      { id: "a", type: "text", text: "INTRO", x: 480, y: 162, fontSize: 22, align: "center", tracks: [fade(1, 5)] },
      { id: "b", type: "text", text: "CONCEPT", x: 480, y: 162, fontSize: 22, align: "center", tracks: [fade(3, 7)] },
    ]);
    const out = fitAuthoredText(spec).spec;
    expect(overlaps(boxOf(out, "a"), boxOf(out, "b"))).toBe(false);
  });

  it("still separates a fading label from a static one it lands on", () => {
    // A static label is visible the whole time, so any fade-in collides with it.
    const spec = base([
      { id: "a", type: "text", text: "INTRO", x: 480, y: 162, fontSize: 22, align: "center" },
      { id: "b", type: "text", text: "CONCEPT", x: 480, y: 162, fontSize: 22, align: "center", tracks: [fade(4, 7)] },
    ]);
    const out = fitAuthoredText(spec).spec;
    expect(overlaps(boxOf(out, "a"), boxOf(out, "b"))).toBe(false);
  });

  it("reads a fade on an ancestor group, not just on the label", () => {
    const spec = base([
      {
        id: "g1",
        type: "group",
        x: 0,
        y: 0,
        tracks: [fade(1, 4)],
        children: [{ id: "a", type: "text", text: "INTRO", x: 480, y: 162, fontSize: 22, align: "center" }],
      },
      {
        id: "g2",
        type: "group",
        x: 0,
        y: 0,
        tracks: [fade(4, 7)],
        children: [{ id: "b", type: "text", text: "CONCEPT", x: 480, y: 162, fontSize: 22, align: "center" }],
      },
    ]);
    expect(fitAuthoredText(spec).repairs).toEqual([]);
  });

  it("treats a label that fades in and stays as visible from then on", () => {
    const stays = {
      property: "opacity",
      keyframes: [
        { t: 2, value: 0 },
        { t: 2.5, value: 1 },
      ],
    };
    const spec = base([
      { id: "a", type: "text", text: "INTRO", x: 480, y: 162, fontSize: 22, align: "center", tracks: [fade(1, 4)] },
      { id: "b", type: "text", text: "CONCEPT", x: 480, y: 162, fontSize: 22, align: "center", tracks: [stays] },
    ]);
    // b is visible from t=2 onward, a until t=4: they overlap on [2, 4].
    const out = fitAuthoredText(spec).spec;
    expect(overlaps(boxOf(out, "a"), boxOf(out, "b"))).toBe(false);
  });
});
