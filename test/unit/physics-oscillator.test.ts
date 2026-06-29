import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, physics } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode, PolylineNode, Track } from "../../src/index.js";

const { spring, springCoil, massSpring, pendulum, inclinedPlane } = physics;
const scene = (nodes: Node[]): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 700,
  height: 400,
  fps: 24,
  duration: 2,
  seed: 1,
  background: "#fff",
  nodes,
});
const kids = (g: Node): Node[] => (g as GroupNode).children;
const span = (kf: Track["keyframes"]): number =>
  Math.max(...kf.map((k) => k.value as number)) - Math.min(...kf.map((k) => k.value as number));

describe("spring", () => {
  it("coils between the two endpoints with a perpendicular zig-zag", () => {
    const pts = springCoil({ x: 0, y: 0 }, { x: 100, y: 0 }, 6, 10);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeCloseTo(10, 5); // zig amplitude
    const s = spring({ from: { x: 0, y: 0 }, to: { x: 80, y: 0 } }) as PolylineNode;
    expect(s.type).toBe("polyline");
    expect(s.points.length).toBeGreaterThan(8);
  });
});

describe("massSpring", () => {
  it("bobs the mass and stretches the coil in SHM (synced, cosine)", () => {
    const m = massSpring({ id: "ms", anchor: { x: 100, y: 40 }, restLength: 120, amplitude: 36, period: 1.4, cycles: 2 });
    const mass = kids(m).find((n) => n.id === "ms-mass") as { tracks?: Track[] };
    const coil = kids(m).find((n) => n.id === "ms-coil") as { tracks?: Track[]; scaleY?: number };
    const yk = mass.tracks!.find((t) => t.property === "y")!.keyframes;
    expect(span(yk)).toBeCloseTo(72, 0); // 2 × amplitude
    expect(coil.tracks!.some((t) => t.property === "scaleY")).toBe(true); // the coil stretches too
    expect(validateScene(scene([m]))).toMatchObject({ valid: true });
  });
});

describe("pendulum", () => {
  it("swings the arm ±amplitude about the pivot", () => {
    const p = pendulum({ id: "pe", pivot: { x: 200, y: 50 }, length: 150, amplitude: 30, period: 1.6, cycles: 2 });
    const arm = kids(p).find((n) => n.id === "pe-arm") as { tracks?: Track[]; children: Node[] };
    const rot = arm.tracks!.find((t) => t.property === "rotation")!.keyframes;
    expect(rot[0]!.value).toBe(30);
    expect(rot[1]!.value).toBe(-30); // swung to the other side
    expect(arm.children.some((c) => c.id === "pe-bob")).toBe(true);
    expect(validateScene(scene([p]))).toMatchObject({ valid: true });
  });
});

describe("inclinedPlane", () => {
  it("builds a right triangle with base = L·cosθ, rise = L·sinθ", () => {
    const r = inclinedPlane({ id: "rp", x: 100, y: 300, angle: 30, length: 200, block: true });
    const tri = kids(r).find((n) => n.id === "rp-tri") as PolylineNode & { closed?: boolean };
    expect(tri.closed).toBe(true);
    const [a, b, c] = tri.points;
    expect(b!.x - a!.x).toBeCloseTo(200 * Math.cos(Math.PI / 6), 1); // base
    expect(a!.y - c!.y).toBeCloseTo(200 * Math.sin(Math.PI / 6), 1); // rise
    expect(kids(r).some((n) => n.id === "rp-block")).toBe(true);
    expect(kids(r).some((n) => n.id === "rp-arc")).toBe(true); // angle marker
    expect(validateScene(scene([r]))).toMatchObject({ valid: true });
  });
  it("renders deterministically", () => {
    const s = scene([inclinedPlane({ id: "rp", x: 50, y: 200, angle: 25 })]);
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 0).pixels))).toBe(true);
  });
});
