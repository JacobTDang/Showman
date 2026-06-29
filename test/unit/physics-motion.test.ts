import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, math, physics } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode, PolylineNode, Track } from "../../src/index.js";

const { coordinatePlane, plotParametric, movingMarker } = math;
const { projectile, energyBars } = physics;
function plane() {
  return coordinatePlane({ id: "p", x: 40, y: 20, width: 400, height: 280, xMin: 0, xMax: 10, yMin: 0, yMax: 6, theme: "ocean", step: 1 });
}
function scene(nodes: Node[]): SceneSpec {
  return { specVersion: SPEC_VERSION, width: 700, height: 360, fps: 24, duration: 2.5, seed: 1, background: "#fff", nodes };
}
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("plotParametric", () => {
  it("samples a parametric curve and drops out-of-range points", () => {
    const pl = plane();
    const circle = plotParametric(pl, (t) => ({ x: 5 + 3 * Math.cos(t), y: 3 + 3 * Math.sin(t) }), {
      tMin: 0,
      tMax: Math.PI * 2,
      samples: 64,
    });
    expect(circle.type).toBe("polyline");
    expect(circle.points.length).toBeGreaterThan(40);
    // A curve entirely out of range degrades to a valid 2-point fallback, never NaN.
    const off = plotParametric(pl, () => ({ x: 999, y: 999 }), { tMin: 0, tMax: 1, samples: 8 });
    expect(off.points.length).toBe(2);
    expect(off.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe("movingMarker", () => {
  it("rides the trajectory with uniform-time keyframes (so on-screen speed = |dr/dt|)", () => {
    const pl = plane();
    const m = movingMarker(pl, (t) => ({ x: t, y: t }), { tMin: 0, tMax: 10, start: 0, duration: 2, samples: 20 }) as { tracks?: Track[] };
    const xk = m.tracks!.find((t) => t.property === "x")!.keyframes;
    // Keyframe TIMES are evenly spaced — that even Δt is what makes the speed physical.
    const dts = xk.slice(1).map((k, i) => +(k.t - xk[i]!.t).toFixed(6));
    expect(new Set(dts).size).toBe(1); // all equal
    expect(xk[0]!.t).toBe(0);
    expect(xk[xk.length - 1]!.t).toBeCloseTo(2, 5);
  });
});

describe("projectile", () => {
  it("draws a parabola + a ball, synced over one window, and validates", () => {
    const pl = plane();
    const p = projectile(pl, { id: "pr", speed: 9.9, angle: 55, g: 9.8, animate: true, start: 0.2, duration: 2 });
    const path = kids(p).find((n) => n.id === "pr-path") as PolylineNode & { tracks?: Track[] };
    const ball = kids(p).find((n) => n.id === "pr-ball") as { tracks?: Track[] };
    expect(path.type).toBe("polyline");
    expect(path.tracks!.some((t) => t.property === "progress")).toBe(true); // draws on
    expect(ball.tracks!.some((t) => t.property === "x")).toBe(true); // ball moves
    expect(validateScene(scene([pl.node, p]))).toMatchObject({ valid: true });
  });
  it("the apex is the highest sampled point and the ball returns to launch height", () => {
    const pl = plane();
    const p = projectile(pl, { id: "pr", speed: 9.9, angle: 55, g: 9.8, showMarker: false });
    const path = kids(p).find((n) => n.id === "pr-path") as PolylineNode;
    const ys = path.points.map((pt) => pt.y);
    // Local y grows downward, so the apex is the MIN y; it should sit above both endpoints.
    expect(Math.min(...ys)).toBeLessThan(path.points[0]!.y);
    expect(path.points[0]!.y).toBeCloseTo(path.points[path.points.length - 1]!.y, 0); // back to launch height
  });
  it("honors showTrajectory/showMarker toggles", () => {
    const pl = plane();
    const onlyBall = projectile(pl, { id: "b", speed: 8, angle: 45, showTrajectory: false });
    expect(kids(onlyBall).some((n) => n.id === "b-path")).toBe(false);
    expect(kids(onlyBall).some((n) => n.id === "b-ball")).toBe(true);
  });
});

describe("energyBars", () => {
  it("sizes each bar to value/max and labels it; grows on when animated", () => {
    const e = energyBars({
      id: "e",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      bars: [
        { label: "KE", value: 6 },
        { label: "PE", value: 3 },
      ],
      max: 12,
      animate: true,
    });
    const bars = kids(e).filter((n) => /-bar-\d+$/.test(n.id)) as Array<{ height: number; tracks?: Track[] }>;
    expect(bars).toHaveLength(2);
    expect(bars[0]!.height).toBeCloseTo(bars[1]!.height * 2, 0); // 6 vs 3
    expect(bars[0]!.tracks!.some((t) => t.property === "scaleY")).toBe(true);
    expect(kids(e).filter((n) => /-lbl-\d+$/.test(n.id))).toHaveLength(2);
    expect(validateScene(scene([e]))).toMatchObject({ valid: true });
  });
  it("renders deterministically", () => {
    const s = scene([energyBars({ id: "e", x: 10, y: 10, bars: [{ label: "KE", value: 4 }], max: 10 })]);
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 0).pixels))).toBe(true);
  });
});
