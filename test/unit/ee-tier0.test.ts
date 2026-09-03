import { describe, expect, it } from "vitest";
import { createDefaultRegistry, validateScene } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { checkConductorConnectivity } from "../../src/authoring/connectivity.js";
import { buildSinusoids } from "../../src/lessons/ee/sinusoids.js";
import { buildImpedancePhasors } from "../../src/lessons/ee/impedancePhasors.js";
import { buildCapacitorInductor } from "../../src/lessons/ee/capacitorInductor.js";
import { buildOhmKvlKcl } from "../../src/lessons/ee/ohmKvlKcl.js";
import { seriesParallelLoop, singleElementLoop } from "../../src/lessons/ee/schematics.js";

const find = (n: any, id: string): any => (n?.id === id ? n : (n?.children ?? []).map((c: any) => find(c, id)).find(Boolean));
const all = (n: any, out: any[] = []): any[] => {
  out.push(n);
  (n?.children ?? []).forEach((c: any) => all(c, out));
  return out;
};
const root = (s: SceneSpec) => ({ children: s.nodes });
const values = (n: any) => n.tracks.find((t: any) => t.property === "value").keyframes.map((k: any) => k.value);

function isLesson(name: string, build: () => SceneSpec, views: string[]) {
  describe(name, () => {
    const lesson = build();
    it("is a valid, deterministic 1280×720 scene of sensible length", () => {
      expect(validateScene(lesson).errors).toEqual([]);
      expect(JSON.stringify(build())).toBe(JSON.stringify(lesson));
      expect(lesson.width).toBe(1280);
      expect(lesson.duration).toBeGreaterThan(15);
      expect(lesson.duration).toBeLessThan(90);
    });
    it("shows every view it promises", () => {
      for (const id of views) expect(find(root(lesson), id), `missing ${id}`).toBeDefined();
    });
    it("narrates every beat without overlap", () => {
      const segs = lesson.narration!.segments!;
      expect(segs.length).toBeGreaterThanOrEqual(4);
      for (let i = 0; i + 1 < segs.length; i++) expect(segs[i]!.t + (segs[i]!.duration ?? 0)).toBeLessThanOrEqual(segs[i + 1]!.t + 1e-9);
    });
    it("is reachable through the catalog as a scene-level tool", () => {
      const reg = createDefaultRegistry();
      expect(reg.get(name)?.level).toBe("scene");
      expect(validateScene(reg.invokeScene(name, {})).errors).toEqual([]);
    });
  });
}

isLesson("ee.sinusoids", () => buildSinusoids(), ["sn-source", "sn-scope", "sn-eq", "sn-knob-a", "sn-knob-f", "sn-knob-p"]);
isLesson("ee.impedancePhasors", () => buildImpedancePhasors(), ["ip-phasor", "ip-scope", "ip-zpane", "ip-eq-z"]);
isLesson("ee.capacitorInductor", () => buildCapacitorInductor(), ["ci-cap", "ci-ind", "ci-scope", "ci-eq-c", "ci-eq-l"]);
isLesson("ee.ohmKvlKcl", () => buildOhmKvlKcl(), ["ok-sch", "ok-scope", "ok-eq-ohm", "ok-eq-kvl", "ok-eq-kcl"]);

describe("Tier 0 schematics are fully wired", () => {
  const scene = (node: any) => ({
    specVersion: 1,
    width: 800,
    height: 450,
    fps: 30,
    duration: 4,
    seed: 0,
    background: "#ffffff",
    nodes: [node],
  });
  for (const el of ["capacitor", "inductor", "resistor"] as const) {
    it(`single ${el} loop passes the connectivity gate`, () => {
      // The gate only judges a scene that carries electrical notation, so label it as a lesson would.
      const label = el === "capacitor" ? "C = 100 nF" : el === "inductor" ? "L = 10 mH" : "R = 1 kΩ";
      const s = scene(singleElementLoop({ id: "l", x: 100, y: 100, element: el, label }).node);
      expect(validateScene(s as never).errors).toEqual([]);
      expect(checkConductorConnectivity(s).status).toBe("passed");
    });
  }
  it("series-parallel loop passes the connectivity gate with the branch shown", () => {
    const s = scene(
      seriesParallelLoop({ id: "sp", x: 100, y: 100, r1Label: "R1 = 1 kΩ", r2Label: "R2 = 2 kΩ", r3Label: "R3 = 2 kΩ" }).node,
    );
    expect(validateScene(s as never).errors).toEqual([]);
    expect(checkConductorConnectivity(s).status).toBe("passed");
  });
});

describe("ee.sinusoids physics", () => {
  const lesson = buildSinusoids();
  it("turns one knob at a time and puts it back", () => {
    expect(values(find(root(lesson), "sn-knob-a"))).toEqual([1, 1, 2, 2, 1]);
    expect(values(find(root(lesson), "sn-knob-f"))).toEqual([1, 1, 2, 2, 1]);
    expect(values(find(root(lesson), "sn-knob-p"))).toEqual([0, 0, 90]);
  });
});

describe("ee.impedancePhasors physics", () => {
  const lesson = buildImpedancePhasors();
  it("has |Z_C| and |Z_L| equal at resonance, halfway through the sweep", () => {
    const zc = values(find(root(lesson), "ip-ctr-zc"));
    const zl = values(find(root(lesson), "ip-ctr-zl"));
    const mid = Math.floor(zc.length / 2);
    expect(zc[mid]).toBeCloseTo(zl[mid], 0);
    // Capacitor falls, inductor rises.
    expect(zc.at(-1)).toBeLessThan(zc[0]);
    expect(zl.at(-1)).toBeGreaterThan(zl[0]);
  });
  it("spins the phasor and draws its shadow on the same window", () => {
    const arrow = find(root(lesson), "ip-phasor-arrow");
    const rot = arrow.tracks.find((t: any) => t.property === "rotation");
    const shadow = find(root(lesson), "ip-scope-shadow");
    const prog = shadow.tracks.find((t: any) => t.property === "progress");
    expect(rot.keyframes[0].t).toBe(prog.keyframes[0].t);
    expect(rot.keyframes[1].t).toBe(prog.keyframes[1].t);
    // Three full turns in six seconds at π rad/s.
    expect(rot.keyframes[1].value).toBeCloseTo(-3 * 360, 6);
  });
});

describe("ee.capacitorInductor physics", () => {
  const lesson = buildCapacitorInductor();
  it("draws the capacitor current with the voltage and the inductor current later", () => {
    const start = (id: string) => find(root(lesson), id).tracks.find((t: any) => t.property === "progress").keyframes[0].t;
    expect(start("ci-scope-ic")).toBe(start("ci-scope-v"));
    expect(start("ci-scope-il")).toBeGreaterThan(start("ci-scope-ic"));
  });
  it("names the lead and the lag", () => {
    const texts = all(root(lesson))
      .filter((n) => n?.type === "text")
      .map((n) => String(n.text));
    expect(texts.some((t) => /leads v by 90/.test(t))).toBe(true);
    expect(texts.some((t) => /lags v by 90/.test(t))).toBe(true);
  });
});

describe("ee.ohmKvlKcl physics", () => {
  const lesson = buildOhmKvlKcl();
  it("obeys Ohm, KVL and KCL in the numbers it shows", () => {
    const I = values(find(root(lesson), "ok-ctr-i"));
    const V1 = values(find(root(lesson), "ok-ctr-v1"));
    const V2 = values(find(root(lesson), "ok-ctr-v2"));
    // Series phase: 12 V / 3 kΩ = 4 mA; 4 V + 8 V = 12 V.
    expect(I[0]).toBeCloseTo(4, 6);
    expect(V1[0] + V2[0]).toBeCloseTo(12, 6);
    // Parallel phase: R2 ∥ R3 = 1 kΩ, so 6 mA; the junction sits at 6 V; 3 + 3 = 6.
    expect(I.at(-1)).toBeCloseTo(6, 6);
    expect(V1.at(-1) + V2.at(-1)).toBeCloseTo(12, 6);
    const I2 = values(find(root(lesson), "ok-ctr-i2")).at(-1);
    const I3 = values(find(root(lesson), "ok-ctr-i3")).at(-1);
    expect(I2 + I3).toBeCloseTo(I.at(-1), 6);
  });
  it("reveals the parallel branch at the KCL beat", () => {
    const branch = find(root(lesson), "ok-sch-branch");
    const op = branch.tracks.find((t: any) => t.property === "opacity");
    const kcl = lesson.narration!.segments!.find((s) => /current law/.test(s.text))!;
    expect(op.keyframes[0].t).toBeCloseTo(kcl.t, 6);
  });
});
