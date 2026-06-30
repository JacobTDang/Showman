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
  it("the apex sits at vy²/(2g) and the ball returns to launch height", () => {
    const pl = plane();
    const speed = 9.9;
    const angle = 55;
    const g = 9.8;
    const p = projectile(pl, { id: "pr", speed, angle, g, showMarker: false });
    const path = kids(p).find((n) => n.id === "pr-path") as PolylineNode;
    const ys = path.points.map((pt) => pt.y);
    // Apex in data units is vy²/(2g); 96 samples place t = flight/2 exactly on a sampled point.
    const rad = (angle * Math.PI) / 180;
    const vx = speed * Math.cos(rad);
    const vy = speed * Math.sin(rad);
    const apex = pl.toLocal((vx * vy) / g, (vy * vy) / (2 * g)); // apex data point → local coords
    expect(Math.min(...ys)).toBeCloseTo(apex.y, 3); // highest point matches the projectile-range apex
    expect(path.points[0]!.y).toBeCloseTo(path.points[path.points.length - 1]!.y, 5); // back to launch height (exact)
  });
  it("keeps degenerate launches finite (flat, vertical, zero-g all hit the flight fallback or edge)", () => {
    const pl = plane();
    for (const o of [
      { angle: 0, g: 9.8 }, // vy=0 → flight fallback to 1
      { angle: 90, g: 9.8 }, // vx=0, straight up/down
      { angle: 45, g: 0 }, // g=0 → flight fallback to 1
    ]) {
      const p = projectile(pl, { id: "e", speed: 8, angle: o.angle, g: o.g, animate: false });
      const path = kids(p).find((n) => n.id === "e-path") as PolylineNode;
      expect(path.points.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))).toBe(true);
      expect(validateScene(scene([pl.node, p]))).toMatchObject({ valid: true });
    }
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
  it("clamps a bar whose value exceeds max to the full height", () => {
    const e = energyBars({ id: "e", x: 0, y: 0, width: 200, height: 100, bars: [{ label: "KE", value: 20 }], max: 10 });
    const bar = kids(e).find((n) => n.id === "e-bar-0") as { height: number };
    expect(bar.height).toBeCloseTo(100 - 24, 5); // min(value,max)/max = 1 → full (h − 24)
  });
  it("guards value:0 and empty bars without invalid geometry", () => {
    const zero = energyBars({ id: "z", x: 0, y: 0, bars: [{ label: "KE", value: 0 }], max: 10, animate: true });
    const zbar = kids(zero).find((n) => n.id === "z-bar-0") as { height: number; tracks?: Track[] };
    expect(zbar.height).toBe(0);
    expect(zbar.tracks).toBeUndefined(); // no grow-on track for a zero-height bar
    const empty = energyBars({ id: "m", x: 0, y: 0, bars: [] });
    expect(kids(empty).filter((n) => /-bar-\d+$/.test(n.id))).toHaveLength(0);
    expect(validateScene(scene([empty]))).toMatchObject({ valid: true });
  });
  it("renders deterministically", () => {
    const s = scene([energyBars({ id: "e", x: 10, y: 10, bars: [{ label: "KE", value: 4 }], max: 10 })]);
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 0).pixels))).toBe(true);
  });
});
