import { describe, expect, it } from "vitest";
import { createDefaultRegistry, validateScene } from "../../src/index.js";
import { buildTheoremOne } from "../../src/lessons/ee/theoremOne.js";
import { rcSchematic } from "../../src/lessons/ee/schematics.js";
import { checkConductorConnectivity } from "../../src/authoring/connectivity.js";
import { rcLowpass } from "../../src/lessons/ee/kit.js";

const find = (n: any, id: string): any => (n?.id === id ? n : (n?.children ?? []).map((c: any) => find(c, id)).find(Boolean));
const all = (n: any, out: any[] = []): any[] => {
  out.push(n);
  (n?.children ?? []).forEach((c: any) => all(c, out));
  return out;
};

describe("rcSchematic", () => {
  for (const series of ["R", "C"] as const) {
    it(`${series}-series network is fully wired`, () => {
      const s = rcSchematic({ id: "s", x: 100, y: 100, series, rLabel: "R = 1 kΩ", cLabel: "C = 100 nF" });
      const scene = { specVersion: 1, width: 800, height: 450, fps: 30, duration: 4, seed: 0, background: "#ffffff", nodes: [s.node] };
      expect(validateScene(scene as never).errors).toEqual([]);
      const check = checkConductorConnectivity(scene);
      expect(check.status, JSON.stringify(check)).toBe("passed");
    });
  }
});

describe("ee.theoremOne", () => {
  const lesson = buildTheoremOne();

  it("is a valid, deterministic 1280×720 scene of sensible length", () => {
    expect(validateScene(lesson).errors).toEqual([]);
    expect(JSON.stringify(buildTheoremOne())).toBe(JSON.stringify(lesson));
    expect(lesson.width).toBe(1280);
    expect(lesson.duration).toBeGreaterThan(20);
    expect(lesson.duration).toBeLessThan(60);
  });

  it("shows all three views: schematic, scope, and Bode plot", () => {
    expect(find({ children: lesson.nodes }, "t1-sch")).toBeDefined();
    expect(find({ children: lesson.nodes }, "t1-scope")).toBeDefined();
    expect(find({ children: lesson.nodes }, "t1-bode")).toBeDefined();
  });

  it("reads |T| live, passing through -3 dB at the corner, halfway through the sweep", () => {
    const ctr = find({ children: lesson.nodes }, "t1-ctr-mag");
    const track = ctr.tracks.find((t: any) => t.property === "value");
    const mid = track.keyframes[Math.floor(track.keyframes.length / 2)];
    expect(mid.value).toBeCloseTo(-3.01, 1);
    // Starts near unity, ends deep in the stop band.
    expect(track.keyframes[0].value).toBeGreaterThan(-0.1);
    expect(track.keyframes.at(-1).value).toBeLessThan(-19);
  });

  it("reads ∠T live, passing through -45° at the corner", () => {
    const ctr = find({ children: lesson.nodes }, "t1-ctr-ph");
    const track = ctr.tracks.find((t: any) => t.property === "value");
    const mid = track.keyframes[Math.floor(track.keyframes.length / 2)];
    expect(mid.value).toBeCloseTo(-45, 0);
  });

  it("drives the scope and the Bode dot from the same sweep window", () => {
    const nodes = all({ children: lesson.nodes });
    const progress = nodes.filter((n) => n?.tracks?.some((t: any) => t.property === "progress"));
    const dots = nodes.filter((n) => /-dot$/.test(String(n?.id)));
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(dots.length).toBeGreaterThanOrEqual(4);
    const starts = new Set<number>();
    for (const n of [...progress, ...dots]) for (const t of n.tracks ?? []) starts.add(t.keyframes[0].t);
    // Every trace and dot begins at the sweep start -- one clock.
    expect(starts.size).toBe(1);
  });

  it("names the corner with the actual RC values", () => {
    const T = rcLowpass(1000, 100e-9);
    const note = find({ children: lesson.nodes }, "t1-corner");
    expect(note.text).toContain("−3 dB");
    expect(note.text).toContain("−45°");
    expect(note.text).toContain(`${(T.omega0 / 1e3).toFixed(1)} krad/s`);
  });

  it("narrates every beat and mentions the theorem by name", () => {
    const segs = lesson.narration!.segments!;
    expect(segs.length).toBe(5);
    expect(segs.map((s) => s.text).join(" ")).toMatch(/Theorem one/);
    for (let i = 0; i + 1 < segs.length; i++) expect(segs[i]!.t + (segs[i]!.duration ?? 0)).toBeLessThanOrEqual(segs[i + 1]!.t + 1e-9);
  });

  it("is reachable through the catalog as a scene-level tool", () => {
    const reg = createDefaultRegistry();
    const tool = reg.get("ee.theoremOne");
    expect(tool?.level).toBe("scene");
    const scene = reg.invokeScene("ee.theoremOne", { R: 2200, C: 47e-9 });
    expect(validateScene(scene).errors).toEqual([]);
    expect(find({ children: scene.nodes }, "t1-corner").text).toContain("krad/s");
  });
});
