import { describe, expect, it } from "vitest";
import { createDefaultRegistry, validateScene } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { checkConductorConnectivity } from "../../src/authoring/connectivity.js";
import { selectEeLesson } from "../../src/authoring/lessonRouting.js";
import { TIER2_PHRASES } from "../../src/lessons/ee/phrases.tier2.js";
import { integratorStage, invertingStage, nonInvertingStage, summingStage } from "../../src/lessons/ee/opAmpSchematics.js";
import { buildOpAmpRules, OPEN_LOOP } from "../../src/lessons/ee/opAmpRules.js";
import { buildInvertingAmp } from "../../src/lessons/ee/invertingAmp.js";
import { buildNonInvertingSumming, SUMMING } from "../../src/lessons/ee/nonInvertingSumming.js";
import { buildIntegrator } from "../../src/lessons/ee/integrator.js";

const find = (n: any, id: string): any => (n?.id === id ? n : (n?.children ?? []).map((c: any) => find(c, id)).find(Boolean));
const all = (n: any, out: any[] = []): any[] => {
  out.push(n);
  (n?.children ?? []).forEach((c: any) => all(c, out));
  return out;
};
const root = (s: SceneSpec) => ({ children: s.nodes });
const valueTrackOf = (n: any) => n.tracks.find((t: any) => t.property === "value").keyframes;
/** A counter's reading: the first or last keyframe of its value track, or its static value. */
const reads = (n: any, which: "first" | "last" = "first") => {
  const tr = (n.tracks ?? []).find((t: any) => t.property === "value");
  return tr ? (which === "first" ? tr.keyframes[0].value : tr.keyframes.at(-1).value) : n.value;
};
/** Local y of a trace polyline, in the plane's own pixels (screen-down). */
const ys = (n: any): number[] => n.points.map((p: any) => p.y);
const span = (v: number[]) => Math.max(...v) - Math.min(...v);

/** What every lesson must satisfy. */
function isLesson(name: string, build: () => SceneSpec, views: string[]) {
  describe(name, () => {
    const lesson = build();
    it("is a valid, deterministic 1280×720 scene of sensible length", () => {
      expect(validateScene(lesson).errors).toEqual([]);
      expect(JSON.stringify(build())).toBe(JSON.stringify(lesson));
      expect(lesson.width).toBe(1280);
      expect(lesson.height).toBe(720);
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
    it("never emits an empty text node", () => {
      for (const n of all(root(lesson))) if (n?.type === "text") expect(String(n.text).length, n.id).toBeGreaterThan(0);
    });
    it("is reachable through the catalog as a scene-level tool", () => {
      const reg = createDefaultRegistry();
      expect(reg.get(name)?.level).toBe("scene");
      expect(validateScene(reg.invokeScene(name, {})).errors).toEqual([]);
    });
  });
}

isLesson("ee.opAmpRules", () => buildOpAmpRules(), ["or-sch", "or-scope-open", "or-scope-closed", "or-vtc", "or-eq-model", "or-ctr-a"]);
isLesson("ee.invertingAmp", () => buildInvertingAmp(), ["ia-sch", "ia-scope", "ia-vtc", "ia-eq-gain", "ia-ctr-gain"]);
isLesson("ee.nonInvertingSumming", () => buildNonInvertingSumming(), [
  "ns-sch-ni",
  "ns-sch-sum",
  "ns-scope-ni",
  "ns-scope-sum",
  "ns-vtc-ni",
  "ns-vtc-sum",
  "ns-ctr-w1",
  "ns-ctr-w2",
]);
isLesson("ee.integrator", () => buildIntegrator(), [
  "ig-sch-int",
  "ig-sch-diff",
  "ig-scope-int",
  "ig-scope-diff",
  "ig-vtc-int",
  "ig-vtc-diff",
  "ig-ctr-slope",
]);

/* ------------------------------------------------------- schematic contract */

/** A stage on its own, wrapped as the smallest scene the connectivity gate will judge. */
const asScene = (node: unknown): unknown => ({ width: 1280, height: 720, nodes: [node] });

describe("opAmpSchematics — every stage is a connected circuit", () => {
  const stages = {
    invertingStage: invertingStage({ id: "s", x: 100, y: 100 }),
    nonInvertingStage: nonInvertingStage({ id: "s", x: 100, y: 100 }),
    summingStage: summingStage({ id: "s", x: 100, y: 100 }),
    integratorStage: integratorStage({ id: "s", x: 100, y: 100 }),
    differentiator: integratorStage({ id: "s", x: 100, y: 100, input: "capacitor", feedback: "resistor" }),
  };
  for (const [name, stage] of Object.entries(stages)) {
    it(`${name} passes the conductor connectivity gate`, () => {
      const check = checkConductorConnectivity(asScene(stage.node));
      expect(check.status, `${name}: ${JSON.stringify(check.stranded)}`).toBe("passed");
      expect(check.conductors).toBeGreaterThanOrEqual(4);
    });
  }
  it("reports terminal points inside the node it draws, offset by x/y", () => {
    const stage = invertingStage({ id: "s", x: 100, y: 100 });
    expect(stage.points.inputs.length).toBe(1);
    expect(stage.points.inputs[0]!.x).toBeGreaterThanOrEqual(100);
    // The summing node is the op-amp's inverting terminal, left of the output terminal.
    expect(stage.points.summing.x).toBeLessThan(stage.points.out.x);
    expect(stage.points.out.x - 100).toBeLessThanOrEqual(stage.bbox.w);
  });
  it("gives the summing stage one input per weight", () => {
    expect(summingStage({ id: "s", x: 0, y: 0 }).points.inputs.length).toBe(2);
  });
});

/* --------------------------------------------------------------- routing */

describe("Tier 2 routing", () => {
  const pick = (brief: string) => selectEeLesson({ brief } as any)?.name ?? null;
  it("sends each lesson's own topic to that lesson", () => {
    expect(pick("show me how an inverting amplifier works")).toBe("ee.invertingAmp");
    expect(pick("animate a summing amplifier")).toBe("ee.nonInvertingSumming");
    expect(pick("explain the op amp integrator")).toBe("ee.integrator");
    expect(pick("what is a virtual ground")).toBe("ee.opAmpRules");
  });
  it("lets a longer topic beat the shorter one it contains", () => {
    expect(pick("draw an inverting op amp stage")).toBe("ee.invertingAmp");
  });
  it("claims no phrase so broad that another tier's topic cannot win", () => {
    // "op amp" alone would cancel every brief tiers 3 and 4 are built for.
    for (const l of TIER2_PHRASES) for (const p of l.phrases) expect(["op amp", "operational amplifier", "amplifier"]).not.toContain(p);
  });
});

/* --------------------------------------------------------------- physics */

describe("ee.opAmpRules physics", () => {
  const lesson = buildOpAmpRules();
  it("climbs the open-loop gain counter to the model's A", () => {
    const kf = valueTrackOf(find(root(lesson), "or-ctr-a"));
    expect(kf[0]!.value).toBeLessThan(kf.at(-1)!.value);
    expect(kf.at(-1)!.value).toBeCloseTo(OPEN_LOOP.A, 0);
  });
  it("draws v_out against (v+ - v-) as an almost vertical line", () => {
    const curve = find(root(lesson), "or-vtc-line");
    const pts: Array<{ x: number; y: number }> = curve.points;
    const xSpan = span(pts.map((p) => p.x));
    const ySpan = span(pts.map((p) => p.y));
    const top = Math.min(...pts.map((p) => p.y));
    const bottom = Math.max(...pts.map((p) => p.y));
    // Everything off the two rails: the whole linear region of the device.
    const climbing = pts.filter((p) => p.y > top + 0.02 * ySpan && p.y < bottom - 0.02 * ySpan);
    expect(climbing.length).toBeGreaterThan(0);
    // It is crossed within a couple of samples of x — vertical at any scale you can read.
    expect(span(climbing.map((p) => p.x))).toBeLessThan(0.02 * xSpan);
    // And on either side of it the output is pinned: flat rails, not a slope.
    expect(pts.filter((p) => p.y <= top + 0.02 * ySpan).length).toBeGreaterThan(0.4 * pts.length);
    expect(pts.filter((p) => p.y >= bottom - 0.02 * ySpan).length).toBeGreaterThan(0.4 * pts.length);
  });
  it("states the linear input range the model implies, in microvolts", () => {
    const texts = all(root(lesson))
      .filter((n) => n?.type === "text")
      .map((n) => String(n.text))
      .join(" ");
    const microvolts = Math.round((OPEN_LOOP.vSat / OPEN_LOOP.A) * 1e6);
    expect(texts).toContain(`${microvolts} µV`);
  });
  it("has v- flat while the loop is open and riding v+ once it closes", () => {
    const open = ys(find(root(lesson), "or-scope-open-minus"));
    const closed = ys(find(root(lesson), "or-scope-closed-minus"));
    const plus = ys(find(root(lesson), "or-scope-closed-plus"));
    expect(span(open)).toBeLessThan(1e-6);
    expect(span(closed)).toBeGreaterThan(10);
    for (let i = 0; i < closed.length; i++) expect(closed[i]!).toBeCloseTo(plus[i]!, 6);
  });
});

describe("ee.invertingAmp physics", () => {
  const lesson = buildInvertingAmp({ Rin: 10e3, Rf1: 20e3, Rf2: 40e3 });
  it("reads the gain as -R_f/R_in, before and after the change", () => {
    const kf = valueTrackOf(find(root(lesson), "ia-ctr-gain"));
    expect(kf[0]!.value).toBeCloseTo(-20e3 / 10e3, 6);
    expect(kf.at(-1)!.value).toBeCloseTo(-40e3 / 10e3, 6);
  });
  it("scales the output trace by the gain and inverts it", () => {
    const vin = find(root(lesson), "ia-scope-in");
    const out1 = find(root(lesson), "ia-scope-out1");
    const out2 = find(root(lesson), "ia-scope-out2");
    const pin = span(ys(vin));
    expect(span(ys(out1)) / pin).toBeCloseTo(2, 1);
    expect(span(ys(out2)) / pin).toBeCloseTo(4, 1);
    // Same instant, opposite sides of the midline: that is what "inverting" means.
    const mid = (v: number[]) => (Math.max(...v) + Math.min(...v)) / 2;
    const i = Math.floor(ys(vin).length * 0.12);
    const dIn = ys(vin)[i]! - mid(ys(vin));
    const dOut = ys(out1)[i]! - mid(ys(out1));
    expect(Math.sign(dIn) * Math.sign(dOut)).toBe(-1);
  });
  it("draws two transfer lines whose slopes are the two gains", () => {
    const slope = (id: string) => {
      const pts = find(root(lesson), id).points as Array<{ x: number; y: number }>;
      const a = pts[0]!;
      const b = pts.at(-1)!;
      return (b.y - a.y) / (b.x - a.x); // screen-down, so a positive number is a negative gain
    };
    expect(slope("ia-vtc-g2") / slope("ia-vtc-g1")).toBeCloseTo(2, 1);
    expect(slope("ia-vtc-g1")).toBeGreaterThan(0);
  });
});

describe("ee.nonInvertingSumming physics", () => {
  const lesson = buildNonInvertingSumming();
  it("reads the non-inverting gain as 1 + R_f/R_g", () => {
    expect(reads(find(root(lesson), "ns-ctr-gain"))).toBeCloseTo(1 + SUMMING.Rf / SUMMING.Rg, 6);
  });
  it("reads each summing weight as R_f/R_k", () => {
    expect(reads(find(root(lesson), "ns-ctr-w1"))).toBeCloseTo(SUMMING.Rf / SUMMING.R1, 6);
    expect(reads(find(root(lesson), "ns-ctr-w2"))).toBeCloseTo(SUMMING.Rf / SUMMING.R2, 6);
  });
  it("keeps the non-inverting output in phase with its input", () => {
    const vin = ys(find(root(lesson), "ns-scope-ni-in"));
    const out = ys(find(root(lesson), "ns-scope-ni-out"));
    const mid = (v: number[]) => (Math.max(...v) + Math.min(...v)) / 2;
    const i = Math.floor(vin.length * 0.12);
    expect(Math.sign(vin[i]! - mid(vin)) * Math.sign(out[i]! - mid(out))).toBe(1);
    expect(span(out) / span(vin)).toBeCloseTo(1 + SUMMING.Rf / SUMMING.Rg, 1);
  });
  it("draws the summed output as the weighted sum at every sampled instant", () => {
    const v1 = ys(find(root(lesson), "ns-scope-sum-v1"));
    const v2 = ys(find(root(lesson), "ns-scope-sum-v2"));
    const out = ys(find(root(lesson), "ns-scope-sum-out"));
    expect(v1.length).toBe(out.length);
    // The three planes share one voltage range, so plane pixels are plane volts up to a
    // constant: v_out = -(w1 v1 + w2 v2) must hold on the drawn samples themselves.
    const mid = (v: number[]) => (Math.max(...v) + Math.min(...v)) / 2;
    const [m1, m2, mo] = [mid(v1), mid(v2), mid(out)];
    const w1 = SUMMING.Rf / SUMMING.R1;
    const w2 = SUMMING.Rf / SUMMING.R2;
    let worst = 0;
    for (let i = 0; i < out.length; i += 7) {
      const predicted = -(w1 * (m1 - v1[i]!) + w2 * (m2 - v2[i]!));
      worst = Math.max(worst, Math.abs(predicted - (mo - out[i]!)));
    }
    expect(worst).toBeLessThan(0.5); // half a pixel over the whole trace
  });
});

describe("ee.integrator physics", () => {
  const R = 10e3;
  const C = 100e-9;
  const lesson = buildIntegrator({ R, C });
  it("reads the ramp slope as -V_in/(RC), flipping with the square wave", () => {
    const kf = valueTrackOf(find(root(lesson), "ig-ctr-slope"));
    const expected = 1 / (R * C) / 1000; // V/ms for a 1 V input
    const values = kf.map((k: any) => k.value);
    expect(Math.max(...values)).toBeCloseTo(expected, 6);
    expect(Math.min(...values)).toBeCloseTo(-expected, 6);
    // It flips: at least three held levels across the drawn window.
    const levels = values.filter((v: number, i: number) => i === 0 || v !== values[i - 1]);
    expect(levels.length).toBeGreaterThanOrEqual(4);
  });
  it("ramps linearly, half the input's height, once per half period", () => {
    const vin = ys(find(root(lesson), "ig-scope-int-in"));
    const out = ys(find(root(lesson), "ig-scope-int-out"));
    // A 1 V square through RC = 1 ms over a 1 ms half period sweeps exactly 1 V: half of 2 V pp.
    expect(span(out) / span(vin)).toBeCloseTo(0.5, 2);
    // The first quarter of the window is one ramp: constant first difference, no curvature.
    const n = Math.floor(out.length / 4);
    const d = [];
    for (let i = 1; i < n; i++) d.push(out[i]! - out[i - 1]!);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    expect(mean).toBeGreaterThan(0); // screen-down: falling voltage
    for (const step of d) expect(Math.abs(step - mean)).toBeLessThan(0.05 * Math.abs(mean) + 0.05);
  });
  it("differentiates a triangle into a square of the same period", () => {
    const out = ys(find(root(lesson), "ig-scope-diff-out"));
    const mid = (Math.max(...out) + Math.min(...out)) / 2;
    const flips = out.filter((y, i) => i > 0 && Math.sign(y - mid) !== Math.sign(out[i - 1]! - mid)).length;
    expect(flips).toBeGreaterThanOrEqual(3);
    // Flat between flips: a square wave, not a ramp.
    const nearMid = out.filter((y) => Math.abs(y - mid) < 0.2 * span(out)).length;
    expect(nearMid).toBeLessThan(0.1 * out.length);
  });
  it("shows both dynamic loci as closed loops, not single-valued curves", () => {
    for (const id of ["ig-vtc-int-loop", "ig-vtc-diff-loop"]) {
      const pts = find(root(lesson), id).points as Array<{ x: number; y: number }>;
      expect(span(pts.map((p) => p.x))).toBeGreaterThan(20);
      expect(span(pts.map((p) => p.y))).toBeGreaterThan(20);
      // A locus that revisits an x with two different y values has no transfer characteristic.
      const first = pts[0]!;
      const twin = pts.find((p, i) => i > pts.length / 4 && Math.abs(p.x - first.x) < 2 && Math.abs(p.y - first.y) > 20);
      expect(twin, id).toBeDefined();
    }
  });
});
