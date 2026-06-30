import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, diagram } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";
import { samplePixel } from "../helpers.js";

const { connector, box, table, flowchart } = diagram;

function scene(nodes: Node[], w = 300, h = 200): SceneSpec {
  return { specVersion: SPEC_VERSION, width: w, height: h, fps: 1, duration: 1, seed: 1, background: "#ffffff", nodes };
}
const kids = (g: GroupNode): Node[] => g.children;
const hasInk = (r: ReturnType<typeof renderFrame>, x: number, y: number): boolean => {
  const p = samplePixel(r, x, y);
  return p.r + p.g + p.b < 720;
};

describe("connector", () => {
  it("builds a valid line + end arrowhead for each routing", () => {
    for (const routing of ["straight", "elbow", "curved"] as const) {
      const c = connector({ from: { x: 10, y: 10 }, to: { x: 200, y: 120 }, routing });
      expect(validateScene(scene([c])).valid).toBe(true);
      const ids = kids(c).map((n) => n.id);
      expect(ids).toContain(`${c.id}-line`);
      expect(ids).toContain(`${c.id}-end`); // default endArrow "arrow"
    }
  });

  it("honors arrowhead kinds, dual heads, dash, and a labeled chip", () => {
    const none = connector({ from: { x: 0, y: 0 }, to: { x: 50, y: 0 }, endArrow: "none" });
    expect(kids(none).some((n) => n.id.endsWith("-end"))).toBe(false);
    const both = connector({
      from: { x: 0, y: 0 },
      to: { x: 50, y: 0 },
      startArrow: "diamond",
      endArrow: "open",
      dash: [4, 4],
      label: "n",
      labelBg: "#fff",
    });
    const ids = kids(both).map((n) => n.id);
    expect(ids).toContain(`${both.id}-start`);
    expect(ids).toContain(`${both.id}-label`);
    expect(validateScene(scene([both])).valid).toBe(true);
  });

  it("actually renders an arrowhead (ink near the target)", () => {
    const c = connector({ from: { x: 20, y: 100 }, to: { x: 260, y: 100 }, stroke: "#000000" });
    const r = renderFrame(scene([c]), 0);
    expect(hasInk(r, 255, 100)).toBe(true); // arrowhead tip region
    // the arrowhead is a wedge: a column just behind the tip is taller than the bare 2px line.
    const colInk = (x: number): number => {
      let n = 0;
      for (let y = 80; y < 120; y++) if (hasInk(r, x, y)) n++;
      return n;
    };
    expect(colInk(252)).toBeGreaterThan(colInk(140) + 4); // wedge near tip vs thin shaft mid-line
  });
});

describe("box shapes", () => {
  it("computes ports and stays valid for every shape", () => {
    for (const shape of ["rect", "rounded", "ellipse", "diamond", "parallelogram", "hexagon", "cylinder"] as const) {
      const b = box({ x: 10, y: 20, width: 100, height: 40, shape, label: "Hi" });
      expect(validateScene(scene([b.node])).valid).toBe(true);
      expect(b.ports.center).toEqual({ x: 60, y: 40 });
      expect(b.ports.top).toEqual({ x: 60, y: 20 });
      // The parallelogram's right port follows its slanted edge (inset by w*0.2/2 = 10).
      expect(b.ports.right).toEqual({ x: shape === "parallelogram" ? 100 : 110, y: 40 });
    }
  });
  it("wraps a long label inside the box", () => {
    const b = box({ x: 0, y: 0, width: 120, height: 80, label: "A long label that should wrap across lines" });
    const label = kids(b.node).find((n) => n.id.endsWith("-label")) as { maxWidth?: number };
    expect(label.maxWidth).toBe(104); // width - 16 padding
  });
});

describe("data table", () => {
  const rows = [
    ["Method", "Idempotent"],
    ["GET", "yes"],
    ["POST", "no"],
  ];
  it("measures columns, renders header + cells + grid, and is valid", () => {
    const t = table({ x: 10, y: 10, rows, columnAlign: ["left", "center"] });
    expect(t.width).toBeGreaterThan(0);
    expect(t.height).toBe(3 * Math.round(16 * 2.1));
    expect(validateScene(scene([t.node], 400, 200)).valid).toBe(true);
    const header = kids(t.node).find((n) => n.id === `${t.node.id}-cell-0-0`) as { fontWeight?: number };
    expect(header.fontWeight).toBe(700); // header row bold
  });
  it("scales columns to a forced total width", () => {
    const t = table({ x: 0, y: 0, rows, width: 500 });
    expect(t.width).toBeCloseTo(500, 0);
  });
});

describe("flowchart", () => {
  it("composes boxes + auto-routed edges and skips edges to unknown nodes", () => {
    const fc = flowchart({
      nodes: [
        { id: "a", x: 20, y: 20, width: 100, height: 50, shape: "ellipse", label: "A" },
        { id: "b", x: 20, y: 140, width: 100, height: 50, shape: "rect", label: "B" },
      ],
      edges: [
        { from: "a", to: "b", label: "go" },
        { from: "a", to: "ghost" },
      ],
    });
    const childIds = kids(fc).map((n) => n.id);
    expect(childIds).toContain("flow-a"); // box groups, namespaced under the flowchart id
    expect(childIds).toContain("flow-b");
    expect(childIds.filter((i) => i.includes("-edge-")).length).toBe(1); // ghost edge skipped
    expect(validateScene(scene([fc], 200, 240)).valid).toBe(true);
  });

  it("rejects duplicate node ids", () => {
    expect(() =>
      flowchart({
        nodes: [
          { id: "x", x: 0, y: 0, width: 60, height: 30 },
          { id: "x", x: 0, y: 50, width: 60, height: 30 },
        ],
      }),
    ).toThrow(/duplicate/i);
  });
});

describe("diagram review fixes", () => {
  it("an empty-string label produces a valid scene (no empty text node) for connector + box", () => {
    const c = connector({ from: { x: 0, y: 0 }, to: { x: 60, y: 0 }, label: "  " });
    expect(kids(c).some((n) => n.id.endsWith("-label"))).toBe(false);
    expect(validateScene(scene([c])).valid).toBe(true);
    const b = box({ x: 0, y: 0, width: 60, height: 30, label: "" });
    expect(kids(b.node).some((n) => n.id.endsWith("-label"))).toBe(false);
    expect(validateScene(scene([b.node])).valid).toBe(true);
  });

  it("places a straight connector's label at the line midpoint, not the endpoint", () => {
    const c = connector({ from: { x: 20, y: 20 }, to: { x: 220, y: 20 }, label: "hi" });
    const label = kids(c).find((n) => n.id.endsWith("-label")) as { x: number; y: number };
    expect(label.x).toBe(120); // (20+220)/2, not 220
    expect(label.y).toBe(20);
  });

  it("keeps a tiny labeled box valid (maxWidth clamped)", () => {
    const b = box({ x: 0, y: 0, width: 12, height: 12, label: "ok" });
    expect(validateScene(scene([b.node])).valid).toBe(true);
  });

  it("honors a forced table width even with empty rows", () => {
    expect(table({ x: 0, y: 0, rows: [], width: 300 }).width).toBe(300);
  });
});
