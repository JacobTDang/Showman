import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, physics } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode, PolylineNode, Track } from "../../src/index.js";

const { motionGraph } = physics;
const a0 = 2;
const series = [
  { label: "x", fn: (t: number) => 0.5 * a0 * t * t, color: "#2563eb" },
  { label: "v", fn: (t: number) => a0 * t, color: "#16a34a" },
  { label: "a", fn: () => a0, color: "#dc2626", yMin: 0, yMax: 4 },
];
const scene = (node: Node): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 460,
  height: 420,
  fps: 24,
  duration: 2.6,
  seed: 1,
  background: "#fff",
  nodes: [node],
});
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("motionGraph", () => {
  it("stacks a plane + drawing curve + trace dot per series, with one shared sweep", () => {
    const mg = motionGraph({ id: "mg", x: 40, y: 20, width: 360, height: 360, tMax: 5, series, start: 0.2, duration: 2 });
    expect(kids(mg).filter((n) => /^mg-p\d+$/.test(n.id))).toHaveLength(3); // 3 stacked planes
    const curves = kids(mg).filter((n) => /^mg-c\d+$/.test(n.id)) as Array<{ tracks?: Track[] }>;
    expect(curves).toHaveLength(3);
    expect(curves.every((c) => c.tracks!.some((t) => t.property === "progress"))).toBe(true); // all draw on
    expect(kids(mg).filter((n) => /^mg-dot\d+$/.test(n.id))).toHaveLength(3); // a trace dot per curve
    expect(kids(mg).filter((n) => n.id === "mg-sweep")).toHaveLength(1); // one sweep across all
    expect(validateScene(scene(mg))).toMatchObject({ valid: true });
  });
  it("renders the right shapes (x-t curves up, v-t rises linearly, a-t flat)", () => {
    const mg = motionGraph({ id: "mg", x: 40, y: 20, width: 360, height: 360, tMax: 5, series, trace: false });
    const pts = (i: number) => (kids(mg).find((n) => n.id === `mg-c${i}`) as PolylineNode).points;
    const xt = pts(0);
    expect(xt[xt.length - 1]!.y).toBeLessThan(xt[0]!.y); // x grows → curve climbs (local y down)
    // v-t is v = a0·t → a straight line: every point sits on the chord through its endpoints.
    const vt = pts(1);
    const x0 = vt[0]!.x;
    const y0 = vt[0]!.y;
    const xN = vt[vt.length - 1]!.x;
    const yN = vt[vt.length - 1]!.y;
    const maxDev = Math.max(...vt.map((p) => Math.abs(y0 + ((yN - y0) * (p.x - x0)) / (xN - x0) - p.y)));
    expect(maxDev).toBeLessThan(1e-6); // collinear → genuinely linear
    expect(yN).toBeLessThan(y0); // v rises with t → local y falls
    const at = pts(2);
    expect(at[0]!.y).toBeCloseTo(at[at.length - 1]!.y, 5); // a is constant → flat line (exact)
    expect(kids(mg).filter((n) => /^mg-dot\d+$/.test(n.id))).toHaveLength(0); // trace:false → no dots
    expect(kids(mg).some((n) => n.id === "mg-sweep")).toBe(false);
  });
  it("draws on over time (deterministically)", () => {
    const s = scene(motionGraph({ id: "mg", x: 40, y: 20, tMax: 5, series, start: 0, duration: 2 }));
    expect(Buffer.from(renderFrame(s, 4).pixels).equals(Buffer.from(renderFrame(s, 40).pixels))).toBe(false);
    expect(Buffer.from(renderFrame(s, 20).pixels).equals(Buffer.from(renderFrame(s, 20).pixels))).toBe(true);
  });
});
