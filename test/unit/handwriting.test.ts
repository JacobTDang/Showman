import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, handwriting } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode, Track } from "../../src/index.js";

const { writeOn, penStroke } = handwriting;
const pts = [
  { x: 20, y: 20 },
  { x: 80, y: 60 },
  { x: 160, y: 20 },
];
function scene(node: Node): SceneSpec {
  return { specVersion: SPEC_VERSION, width: 200, height: 100, fps: 20, duration: 1.4, seed: 1, background: "#fff", nodes: [node] };
}

describe("writeOn", () => {
  it("injects a draw-on progress track and preserves existing tracks", () => {
    const base: Node = {
      id: "c",
      type: "polyline",
      x: 0,
      y: 0,
      points: pts,
      stroke: "#000",
      strokeWidth: 3,
      tracks: [
        {
          property: "opacity",
          keyframes: [
            { t: 0, value: 0 },
            { t: 1, value: 1 },
          ],
        },
      ],
    };
    const w = writeOn(base, { duration: 1 }) as { progress?: number; tracks?: Track[] };
    expect(w.progress).toBe(0);
    const props = w.tracks!.map((t) => t.property);
    expect(props).toContain("opacity"); // preserved
    expect(props).toContain("progress"); // added
    const prog = w.tracks!.find((t) => t.property === "progress")!;
    expect(prog.keyframes[0]!.value).toBe(0);
    expect(prog.keyframes[prog.keyframes.length - 1]!.value).toBe(1);
  });
});

describe("penStroke", () => {
  it("builds a self-drawing line with a nib that rides from the first point to the last", () => {
    const g = penStroke({ id: "s", points: pts, duration: 1 }) as GroupNode;
    const line = g.children.find((n) => n.id === "s-line") as { type: string; tracks?: Track[] };
    expect(line.type).toBe("polyline");
    expect(line.tracks!.some((t) => t.property === "progress")).toBe(true);
    const pen = g.children.find((n) => n.id === "s-pen") as { tracks?: Track[] };
    const xk = pen.tracks!.find((t) => t.property === "x")!.keyframes;
    expect(xk[0]!.value).toBeCloseTo(pts[0]!.x - 4.5, 1); // starts at the first point (minus nib half)
    expect(xk[xk.length - 1]!.value).toBeCloseTo(pts[2]!.x - 4.5, 1); // ends at the last point
    // The nib is precomputed by ARC LENGTH, not by keyframe index. For these monotonic-x points the x
    // track must be non-decreasing, and the mid keyframe must sit at the arc-length midpoint (x≈87.75)
    // rather than the geometric mid-vertex (x=80) — the assertion that the interior sampling is correct.
    for (let i = 1; i < xk.length; i++) expect(xk[i]!.value as number).toBeGreaterThanOrEqual(xk[i - 1]!.value as number);
    expect(xk).toHaveLength(21); // n = round(161.55/8) = 20 → 21 samples
    expect(xk[10]!.value).toBeCloseTo(83.25, 1); // arc-length midpoint − nib half (87.75 − 4.5)
  });
  it("omits the nib for a single-point stroke but still emits a drawable line", () => {
    const g = penStroke({ id: "s", points: [{ x: 20, y: 20 }], duration: 1 }) as GroupNode;
    expect(g.children.some((n) => n.id.endsWith("-pen"))).toBe(false); // <2 points → no nib
    const line = g.children.find((n) => n.id === "s-line") as { type: string; tracks?: Track[] };
    expect(line.type).toBe("polyline");
    expect(line.tracks!.some((t) => t.property === "progress")).toBe(true);
  });
  it("omits the nib when pen:false, and hides it before a delayed start", () => {
    expect((penStroke({ points: pts, pen: false }) as GroupNode).children.some((n) => n.id.endsWith("-pen"))).toBe(false);
    const delayed = penStroke({ id: "d", points: pts, start: 0.5, duration: 0.5 }) as GroupNode;
    const pen = delayed.children.find((n) => n.id === "d-pen") as { opacity?: number };
    expect(pen.opacity).toBe(0); // hidden during the start delay
  });
  it("renders a valid scene that animates and is deterministic", () => {
    const s = scene(penStroke({ points: pts, duration: 1 }));
    expect(validateScene(s)).toMatchObject({ valid: true });
    expect(Buffer.from(renderFrame(s, 4).pixels).equals(Buffer.from(renderFrame(s, 19).pixels))).toBe(false); // draws on
    expect(Buffer.from(renderFrame(s, 6).pixels).equals(Buffer.from(renderFrame(s, 6).pixels))).toBe(true); // deterministic
  });
  it("stays valid for very short or zero/negative durations (review fix)", () => {
    for (const duration of [0.04, 0.05, 0, -1]) {
      expect(validateScene(scene(penStroke({ points: pts, duration })))).toMatchObject({ valid: true });
    }
  });
});

describe("writeOn guards", () => {
  it("rejects a non-polyline/path node instead of emitting an invalid scene (review fix)", () => {
    const rect: Node = { id: "r", type: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#000" };
    expect(() => writeOn(rect)).toThrow(/polyline\/path/);
  });
  it("stays valid for a zero duration", () => {
    const base: Node = { id: "p", type: "polyline", x: 0, y: 0, points: pts, stroke: "#000", strokeWidth: 3 };
    expect(validateScene(scene(writeOn(base, { duration: 0 })))).toMatchObject({ valid: true });
  });
});
