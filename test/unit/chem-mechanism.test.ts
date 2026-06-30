import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, chem } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode, PolylineNode, Track } from "../../src/index.js";

const { curlyArrow } = chem;
const scene = (n: Node): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 400,
  height: 200,
  fps: 10,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes: [n],
});
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("curlyArrow", () => {
  const from = { x: 40, y: 100 };
  const to = { x: 200, y: 100 };
  it("draws a curved bezier path with a double-barb head (electron pair)", () => {
    const a = curlyArrow({ id: "a", from, to });
    const path = kids(a).find((n) => n.id === "a-path") as { type: string; d?: string };
    expect(path.type).toBe("path");
    expect(path.d).toMatch(/^M .* Q .*/); // a quadratic bezier
    const head = kids(a).find((n) => n.id === "a-head") as PolylineNode;
    expect(head.points).toHaveLength(3); // barb–tip–barb
    expect(validateScene(scene(a))).toMatchObject({ valid: true });
  });
  it("draws a single-barb fishhook for a radical (half) move", () => {
    const head = kids(curlyArrow({ id: "h", from, to, half: true })).find((n) => n.id === "h-head") as PolylineNode;
    expect(head.points).toHaveLength(2); // tip + one barb
  });
  it("bows to opposite sides for opposite curvature signs", () => {
    const up = kids(curlyArrow({ id: "u", from, to, curvature: 60 })).find((n) => n.id === "u-path") as { d?: string };
    const down = kids(curlyArrow({ id: "d", from, to, curvature: -60 })).find((n) => n.id === "d-path") as { d?: string };
    expect(up.d).not.toBe(down.d); // control point on the other side
  });
  it("draws on (path progress + head fade) and renders deterministically when animated", () => {
    const a = curlyArrow({ id: "a", from, to, animate: true, start: 0, duration: 0.6 });
    const path = kids(a).find((n) => n.id === "a-path") as { tracks?: Track[] };
    expect(path.tracks!.some((t) => t.property === "progress")).toBe(true);
    const head = kids(a).find((n) => n.id === "a-head") as { tracks?: Track[] };
    expect(head.tracks!.some((t) => t.property === "opacity")).toBe(true);
    const s = scene(a);
    expect(Buffer.from(renderFrame(s, 5).pixels).equals(Buffer.from(renderFrame(s, 5).pixels))).toBe(true);
  });
});
