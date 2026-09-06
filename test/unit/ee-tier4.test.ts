import { describe, expect, it } from "vitest";
import { createDefaultRegistry, validateScene } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { checkConductorConnectivity } from "../../src/authoring/connectivity.js";
import { selectEeLesson } from "../../src/authoring/lessonRouting.js";
import { TIER2_PHRASES } from "../../src/lessons/ee/phrases.tier2.js";
import { TIER4_PHRASES } from "../../src/lessons/ee/phrases.tier4.js";
import { OPEN_LOOP } from "../../src/lessons/ee/opAmpRules.js";
import { comparatorStage, relaxationStage, schmittStage } from "../../src/lessons/ee/comparatorSchematics.js";
import { buildComparator, COMPARATOR, noisyInput } from "../../src/lessons/ee/comparator.js";
import { buildSchmittTrigger, SCHMITT } from "../../src/lessons/ee/schmittTrigger.js";
import { buildRelaxationOscillator, RELAXATION } from "../../src/lessons/ee/relaxationOscillator.js";

const find = (n: any, id: string): any => (n?.id === id ? n : (n?.children ?? []).map((c: any) => find(c, id)).find(Boolean));
const all = (n: any, out: any[] = []): any[] => {
  out.push(n);
  (n?.children ?? []).forEach((c: any) => all(c, out));
  return out;
};
const root = (s: SceneSpec) => ({ children: s.nodes });
/** A counter's reading: the first or last keyframe of its value track, or its static value. */
const reads = (n: any, which: "first" | "last" = "first") => {
  const tr = (n.tracks ?? []).find((t: any) => t.property === "value");
  return tr ? (which === "first" ? tr.keyframes[0].value : tr.keyframes.at(-1).value) : n.value;
};
const ys = (n: any): number[] => n.points.map((p: any) => p.y);
const span = (v: number[]) => Math.max(...v) - Math.min(...v);

/**
 * The transitions of a drawn square wave, as fractions of the trace's time axis.
 *
 * The trace is a polyline in plane pixels, sampled uniformly across the window, so the
 * index of a sign change IS the fraction of the window at which the output flipped. Reading
 * the drawing rather than the generating function is the point: a lesson that draws
 * something other than what it computes fails here.
 */
function transitionsOf(trace: any): number[] {
  const v = ys(trace);
  const mid = (Math.max(...v) + Math.min(...v)) / 2;
  const at: number[] = [];
  for (let i = 1; i < v.length; i++) {
    if (Math.sign(v[i]! - mid) !== Math.sign(v[i - 1]! - mid)) at.push((i - 0.5) / (v.length - 1));
  }
  return at;
}

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

isLesson("ee.comparator", () => buildComparator(), ["cp-sch", "cp-scope", "cp-vtc", "cp-eq-rule", "cp-ctr-vref", "cp-ctr-edges"]);
isLesson("ee.schmittTrigger", () => buildSchmittTrigger(), [
  "st-sch",
  "st-scope",
  "st-vtc",
  "st-eq-thresholds",
  "st-ctr-vth",
  "st-ctr-vtl",
  "st-ctr-edges",
]);
isLesson("ee.relaxationOscillator", () => buildRelaxationOscillator(), [
  "ro-sch",
  "ro-scope",
  "ro-vtc",
  "ro-eq-period",
  "ro-ctr-period",
  "ro-ctr-freq",
]);

/* ------------------------------------------------------- schematic contract */

/** A stage on its own, wrapped as the smallest scene the connectivity gate will judge. */
const asScene = (node: unknown): unknown => ({ width: 1280, height: 720, nodes: [node] });

describe("comparatorSchematics — every stage is a connected circuit", () => {
  const stages = {
    comparatorStage: comparatorStage({ id: "s", x: 140, y: 160 }),
    schmittStage: schmittStage({ id: "s", x: 140, y: 120 }),
    relaxationStage: relaxationStage({ id: "s", x: 140, y: 120 }),
  };
  for (const [name, stage] of Object.entries(stages)) {
    it(`${name} passes the conductor connectivity gate`, () => {
      const check = checkConductorConnectivity(asScene(stage.node));
      expect(check.status, `${name}: ${JSON.stringify(check.stranded)}`).toBe("passed");
      expect(check.conductors).toBeGreaterThanOrEqual(4);
    });
  }
  it("reports terminal points inside the node it draws, offset by x/y", () => {
    const stage = comparatorStage({ id: "s", x: 140, y: 160 });
    expect(stage.points.input!.x).toBeGreaterThan(140);
    expect(stage.points.input!.x).toBeLessThan(stage.points.out.x);
    expect(stage.points.out.x - 140).toBeLessThanOrEqual(stage.bbox.w);
    // The + terminal is below the − terminal: that is the symbol's own convention.
    expect(stage.points.plus.y).toBeGreaterThan(stage.points.minus.y);
  });
  it("drives the comparator's signal into the + terminal and the reference into the −", () => {
    const stage = comparatorStage({ id: "s", x: 0, y: 0 });
    expect(stage.points.input!.y).toBe(stage.points.plus.y);
    expect(stage.points.threshold.x).toBeLessThan(stage.points.input!.x);
  });
  it("drives the Schmitt's signal into the − terminal and the feedback into the +", () => {
    const stage = schmittStage({ id: "s", x: 0, y: 0 });
    expect(stage.points.input!.y).toBe(stage.points.minus.y);
    // The divider node hangs below the + terminal it holds at β·v_out.
    expect(stage.points.threshold.y).toBeGreaterThan(stage.points.plus.y);
  });
  it("gives the oscillator no input terminal at all", () => {
    expect(relaxationStage({ id: "s", x: 0, y: 0 }).points.input).toBeUndefined();
  });
});

/* --------------------------------------------------------------- routing */

describe("Tier 4 routing", () => {
  const pick = (brief: string) => selectEeLesson({ brief } as any)?.name ?? null;
  it("sends each lesson's own topic to that lesson", () => {
    expect(pick("show me how a comparator works")).toBe("ee.comparator");
    expect(pick("animate a schmitt trigger")).toBe("ee.schmittTrigger");
    expect(pick("explain hysteresis")).toBe("ee.schmittTrigger");
    expect(pick("build a relaxation oscillator")).toBe("ee.relaxationOscillator");
    expect(pick("a square wave generator from an op amp")).toBe("ee.relaxationOscillator");
    expect(pick("what is a zero crossing detector")).toBe("ee.comparator");
  });
  it("keeps a compound brief on the lesson that actually teaches it", () => {
    expect(pick("a comparator with hysteresis")).toBe("ee.schmittTrigger");
    expect(pick("schmitt trigger comparator")).toBe("ee.schmittTrigger");
    expect(pick("astable multivibrator")).toBe("ee.relaxationOscillator");
  });
  it("claims no phrase another tier already owns", () => {
    const mine = TIER4_PHRASES.flatMap((l) => l.phrases);
    const theirs = new Set(TIER2_PHRASES.flatMap((l) => l.phrases));
    for (const p of mine) expect(theirs.has(p), p).toBe(false);
    // Nothing so broad that every Tier 3 or 5 brief cancels on it.
    for (const p of mine) expect(["op amp", "operational amplifier", "amplifier", "op amp circuit"]).not.toContain(p);
  });
});

/* --------------------------------------------------------------- physics */

describe("ee.comparator physics", () => {
  const lesson = buildComparator();
  it("uses the same rails Tier 2's op-amp model does", () => {
    expect(COMPARATOR.vSat).toBe(OPEN_LOOP.vSat);
  });
  it("reads the reference the schematic is labelled with", () => {
    expect(reads(find(root(lesson), "cp-ctr-vref"))).toBeCloseTo(COMPARATOR.vRef, 6);
  });
  it("snaps the output to a rail and nowhere between", () => {
    const out = ys(find(root(lesson), "cp-scope-out"));
    const top = Math.min(...out);
    const bottom = Math.max(...out);
    // Every sample is on a rail; only the vertical edges between samples are in between.
    const between = out.filter((y) => y > top + 0.1 * (bottom - top) && y < bottom - 0.1 * (bottom - top));
    expect(between.length).toBeLessThan(0.02 * out.length);
  });
  it("chatters: more than one output edge per input crossing", () => {
    const edges = transitionsOf(find(root(lesson), "cp-scope-out"));
    expect(COMPARATOR.crossings.length).toBe(2);
    for (const tc of COMPARATOR.crossings) {
      const near = edges.filter((u) => Math.abs(u * COMPARATOR.tMax - tc) < 0.35);
      expect(near.length, `edges within 0.35 s of the crossing at t=${tc.toFixed(3)}`).toBeGreaterThan(1);
    }
    // Two crossings would ideally give two edges; the drawing shows many more.
    expect(edges.length).toBeGreaterThan(2 * COMPARATOR.crossings.length);
    expect(reads(find(root(lesson), "cp-ctr-edges"))).toBe(edges.length);
  });
  it("resolves the chatter rather than smearing it into one block", () => {
    // A run of rail between the bursts: the output does settle, or the picture is a lie.
    const edges = transitionsOf(find(root(lesson), "cp-scope-out"));
    const gaps = edges.slice(1).map((u, i) => (u - edges[i]!) * COMPARATOR.tMax);
    expect(Math.max(...gaps)).toBeGreaterThan(0.5);
  });
  it("draws the transfer characteristic as a vertical step at V_ref", () => {
    const pts = find(root(lesson), "cp-vtc-step").points as Array<{ x: number; y: number }>;
    const top = Math.min(...pts.map((p) => p.y));
    const bottom = Math.max(...pts.map((p) => p.y));
    const xs = pts.map((p) => p.x);
    const climbing = pts.filter((p) => p.y > top + 0.02 * (bottom - top) && p.y < bottom - 0.02 * (bottom - top));
    expect(climbing.length).toBeGreaterThan(4);
    expect(span(climbing.map((p) => p.x))).toBeLessThan(0.01 * span(xs));
    // Low on the left of the step, high on the right: v_in above V_ref gives +V_sat.
    expect(pts[0]!.y).toBe(bottom);
    expect(pts.at(-1)!.y).toBe(top);
  });
  it("keeps the noise small enough to be noise", () => {
    const clean = (t: number) => COMPARATOR.amp * Math.sin((2 * Math.PI * t) / COMPARATOR.tMax);
    let worst = 0;
    for (let i = 0; i <= 600; i++) {
      const t = (i / 600) * COMPARATOR.tMax;
      worst = Math.max(worst, Math.abs(noisyInput(t) - clean(t)));
    }
    expect(worst).toBeLessThan(0.15 * COMPARATOR.amp);
    expect(worst).toBeGreaterThan(0.05 * COMPARATOR.amp);
  });
});

describe("ee.schmittTrigger physics", () => {
  const lesson = buildSchmittTrigger();
  const beta = SCHMITT.R1 / (SCHMITT.R1 + SCHMITT.R2);
  it("reads both thresholds as ±V_sat·R_1/(R_1+R_2)", () => {
    expect(SCHMITT.beta).toBeCloseTo(beta, 12);
    expect(reads(find(root(lesson), "st-ctr-vth"))).toBeCloseTo(COMPARATOR.vSat * beta, 9);
    expect(reads(find(root(lesson), "st-ctr-vtl"))).toBeCloseTo(-COMPARATOR.vSat * beta, 9);
    expect(SCHMITT.vTh).toBeCloseTo(COMPARATOR.vSat * beta, 9);
    expect(SCHMITT.vTl).toBeCloseTo(-COMPARATOR.vSat * beta, 9);
  });
  it("flips exactly once per crossing on the input that made the comparator chatter", () => {
    const edges = transitionsOf(find(root(lesson), "st-scope-out"));
    expect(edges.length).toBe(2);
    for (const tc of SCHMITT.crossings) {
      const near = edges.filter((u) => Math.abs(u * COMPARATOR.tMax - tc) < 0.35);
      expect(near.length, `edges within 0.35 s of the crossing at t=${tc.toFixed(3)}`).toBe(1);
    }
    expect(reads(find(root(lesson), "st-ctr-edges"))).toBe(2);
  });
  it("beats the comparator on the very same drive", () => {
    const chattering = transitionsOf(find(root(buildComparator()), "cp-scope-out"));
    expect(transitionsOf(find(root(lesson), "st-scope-out")).length).toBeLessThan(chattering.length);
  });
  it("is inverting: the output goes low where the input goes above V_TH", () => {
    const vin = ys(find(root(lesson), "st-scope-in"));
    const out = ys(find(root(lesson), "st-scope-out"));
    const iPeak = vin.indexOf(Math.min(...vin)); // screen-down: the input's highest point
    const mid = (Math.max(...out) + Math.min(...out)) / 2;
    expect(out[iPeak]!).toBeGreaterThan(mid); // screen-down: the output is at its low rail
  });
  it("draws a hysteresis loop with two vertical edges, one at each threshold", () => {
    const pts = find(root(lesson), "st-vtc-loop").points as Array<{ x: number; y: number }>;
    const top = Math.min(...pts.map((p) => p.y));
    const bottom = Math.max(...pts.map((p) => p.y));
    const edgeX = pts.filter((p) => p.y > top + 0.05 * (bottom - top) && p.y < bottom - 0.05 * (bottom - top)).map((p) => p.x);
    expect(edgeX.length).toBeGreaterThan(8);
    const lo = Math.min(...edgeX);
    const hi = Math.max(...edgeX);
    // Two distinct columns, and nothing in between: a loop, not a ramp.
    expect(hi - lo).toBeGreaterThan(0.15 * span(pts.map((p) => p.x)));
    expect(edgeX.filter((x) => x > lo + 1 && x < hi - 1).length).toBe(0);
    // The gap between the columns is the hysteresis band, measured off the drawn axis.
    const vPerPx = (2 * SCHMITT.vAxis) / find(root(lesson), "st-vtc-plane-frame").width;
    expect((hi - lo) * vPerPx).toBeCloseTo(SCHMITT.vTh - SCHMITT.vTl, 1);
  });
});

describe("ee.relaxationOscillator physics", () => {
  const lesson = buildRelaxationOscillator();
  it("states the period the formula gives", () => {
    const beta = SCHMITT.beta;
    const expected = 2 * RELAXATION.R * RELAXATION.C * Math.log((1 + beta) / (1 - beta));
    expect(RELAXATION.period).toBeCloseTo(expected, 12);
    expect(reads(find(root(lesson), "ro-ctr-period"))).toBeCloseTo(expected * 1e6, 2);
    expect(reads(find(root(lesson), "ro-ctr-freq"))).toBeCloseTo(1 / expected / 1e3, 2);
  });
  it("draws a square wave whose period matches 2RC ln((1+β)/(1−β)) within 2%", () => {
    const edges = transitionsOf(find(root(lesson), "ro-scope-out"));
    expect(edges.length).toBeGreaterThanOrEqual(4);
    const halves = edges.slice(1).map((u, i) => (u - edges[i]!) * RELAXATION.tMax);
    const drawn = 2 * (halves.reduce((a, b) => a + b, 0) / halves.length);
    expect(Math.abs(drawn - RELAXATION.period) / RELAXATION.period).toBeLessThan(0.02);
    // Every half is the same length: the two rails are symmetric.
    for (const h of halves) expect(Math.abs(h - RELAXATION.period / 2) / RELAXATION.period).toBeLessThan(0.02);
  });
  it("charges the capacitor exponentially, not linearly, between the thresholds", () => {
    const vc = ys(find(root(lesson), "ro-scope-vc"));
    const edges = transitionsOf(find(root(lesson), "ro-scope-out"));
    // One rising segment, sampled well inside it so the corners do not pollute the fit.
    const i0 = Math.round(edges[0]! * (vc.length - 1) * 0.15);
    const i1 = Math.round(edges[0]! * (vc.length - 1) * 0.95);
    // Plane pixels run down the screen, so a rising voltage is a falling y.
    const a = vc[i0]!;
    const b = vc[Math.round((i0 + i1) / 2)]!;
    const c = vc[i1]!;
    expect(a).toBeGreaterThan(c);
    // A straight ramp would put the midpoint exactly halfway. An exponential decelerating
    // toward a rail is already past halfway, which on screen means a smaller y.
    const straight = (a + c) / 2;
    expect(b).toBeLessThan(straight - 0.04 * (a - c));
  });
  it("swings the capacitor exactly between the two thresholds and no further", () => {
    const vc = ys(find(root(lesson), "ro-scope-vc"));
    const volts = (span(vc) / find(root(lesson), "ro-scope-p0-frame").height) * 2 * RELAXATION.vcAxis;
    expect(volts).toBeCloseTo(SCHMITT.vTh - SCHMITT.vTl, 1);
  });
});
