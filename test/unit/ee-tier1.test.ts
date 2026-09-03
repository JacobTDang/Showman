import { describe, expect, it } from "vitest";
import { createDefaultRegistry, validateScene } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { buildRcFilters } from "../../src/lessons/ee/rcFilters.js";
import { buildTransferCharacteristic } from "../../src/lessons/ee/transferCharacteristic.js";
import { buildPolesStepResponse } from "../../src/lessons/ee/polesStepResponse.js";

const find = (n: any, id: string): any => (n?.id === id ? n : (n?.children ?? []).map((c: any) => find(c, id)).find(Boolean));
const all = (n: any, out: any[] = []): any[] => {
  out.push(n);
  (n?.children ?? []).forEach((c: any) => all(c, out));
  return out;
};
const root = (s: SceneSpec) => ({ children: s.nodes });

/** What every lesson must satisfy. */
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

isLesson("ee.rcFilters", () => buildRcFilters(), ["rf-lp", "rf-hp", "rf-scope", "rf-bode", "rf-eq-lp", "rf-eq-hp"]);
isLesson("ee.transferCharacteristic", () => buildTransferCharacteristic(), ["tc-block", "tc-scope", "tc-lin", "tc-soft", "tc-hard"]);
isLesson("ee.polesStepResponse", () => buildPolesStepResponse(), ["ps-sch", "ps-scope", "ps-splane", "ps-eq-pole"]);

describe("ee.rcFilters physics", () => {
  const lesson = buildRcFilters();
  it("reads both filters at -3 dB at the corner, halfway through the sweep", () => {
    for (const id of ["rf-ctr-lp", "rf-ctr-hp"]) {
      const track = find(root(lesson), id).tracks.find((t: any) => t.property === "value");
      const mid = track.keyframes[Math.floor(track.keyframes.length / 2)];
      expect(mid.value, id).toBeCloseTo(-3.01, 1);
    }
  });
  it("has the lowpass falling and the highpass rising across the sweep", () => {
    const lp = find(root(lesson), "rf-ctr-lp").tracks.find((t: any) => t.property === "value").keyframes;
    const hp = find(root(lesson), "rf-ctr-hp").tracks.find((t: any) => t.property === "value").keyframes;
    expect(lp.at(-1).value).toBeLessThan(lp[0].value);
    expect(hp.at(-1).value).toBeGreaterThan(hp[0].value);
  });
  it("draws three scope traces and two Bode curves with a dot each", () => {
    const ids = all(root(lesson)).map((n) => String(n?.id));
    for (const id of [
      "rf-scope-in",
      "rf-scope-lp",
      "rf-scope-hp",
      "rf-bode-mag-0",
      "rf-bode-mag-1",
      "rf-bode-mag-dot-0",
      "rf-bode-mag-dot-1",
    ])
      expect(ids).toContain(id);
  });
});

describe("ee.transferCharacteristic physics", () => {
  const lesson = buildTransferCharacteristic();
  it("draws one input and three outputs, each output in its own beat", () => {
    const outs = ["tc-lin", "tc-soft", "tc-hard"].map((c) => find(root(lesson), `tc-scope-${c}-out`));
    const starts = outs.map((n) => n.tracks.find((t: any) => t.property === "progress").keyframes[0].t);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(3);
  });
  it("gives each characteristic its own curve pane with a live dot", () => {
    const ids = all(root(lesson)).map((n) => String(n?.id));
    for (const c of ["tc-lin", "tc-soft", "tc-hard"]) {
      expect(ids).toContain(`${c}-curve`);
      expect(ids).toContain(`${c}-dot`);
    }
  });
});

describe("ee.polesStepResponse physics", () => {
  const lesson = buildPolesStepResponse();
  it("slides the pole left after the first step, before the second", () => {
    const pole = find(root(lesson), "ps-splane-pole");
    const move = pole.tracks.find((t: any) => t.property === "x");
    const step1 = find(root(lesson), "ps-scope-step1").tracks.find((t: any) => t.property === "progress").keyframes[0].t;
    const step2 = find(root(lesson), "ps-scope-step2").tracks.find((t: any) => t.property === "progress").keyframes[0].t;
    expect(move.keyframes[0].t).toBeGreaterThan(step1);
    expect(move.keyframes[1].t).toBeLessThanOrEqual(step2);
    expect(move.keyframes[1].value).toBeLessThan(move.keyframes[0].value);
  });
  it("labels 63% on the response axis and reads tau in microseconds", () => {
    const texts = all(root(lesson))
      .filter((n) => n?.type === "text")
      .map((n) => String(n.text));
    expect(texts).toContain("63%");
    const ctr = find(root(lesson), "ps-ctr-tau");
    expect(ctr.suffix).toBe(" µs");
    const track = ctr.tracks.find((t: any) => t.property === "value");
    expect(track.keyframes[0].value).toBeCloseTo(100, 6); // 1 kΩ · 100 nF = 100 µs
    expect(track.keyframes.at(-1).value).toBeCloseTo(100 / 3, 3);
  });
});
