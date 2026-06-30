import { describe, it, expect } from "vitest";
import { bktUpdate, isMastered, DEFAULT_BKT } from "../../src/learning/bkt.js";
import { newCard, scheduleReview, qualityFromAnswer } from "../../src/learning/scheduler.js";
import {
  emptyModel,
  applyResult,
  masteryOf,
  isKcMastered,
  dueKcs,
  weakKcs,
  serializeModel,
  deserializeModel,
} from "../../src/learning/model.js";
import { buildReviewReel } from "../../src/learning/reviewReel.js";
import { recordCueResult } from "../../src/learning/index.js";
import { mcq, pausePrompt } from "../../src/interaction/builders.js";
import { gradeCue } from "../../src/interaction/runtime.js";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

describe("BKT", () => {
  it("raises mastery on a correct answer, lowers it on a wrong one", () => {
    expect(bktUpdate(0.25, true)).toBeGreaterThan(0.25);
    expect(bktUpdate(0.25, false)).toBeLessThan(bktUpdate(0.25, true));
    expect(bktUpdate(0.25, false)).toBeLessThan(0.25);
  });
  it("converges to mastery with repeated correct answers and clamps to [0,1]", () => {
    let p = DEFAULT_BKT.pInit;
    for (let i = 0; i < 6; i++) p = bktUpdate(p, true);
    expect(isMastered(p)).toBe(true);
    expect(bktUpdate(1, true)).toBeLessThanOrEqual(1);
    expect(bktUpdate(0, false)).toBeGreaterThanOrEqual(0);
  });
  it("uses the prior for non-finite input", () => {
    expect(bktUpdate(NaN, true)).toBe(bktUpdate(DEFAULT_BKT.pInit, true));
  });
});

describe("SM-2 scheduler", () => {
  it("grows the interval on passes (1 → 6 → ×ease) and is due immediately when new", () => {
    expect(newCard(NOW).dueAt).toBe(NOW);
    const c1 = scheduleReview(newCard(NOW), 4, NOW);
    expect(c1.reps).toBe(1);
    expect(c1.intervalDays).toBe(1);
    expect(c1.dueAt).toBe(NOW + DAY);
    const c2 = scheduleReview(c1, 4, NOW);
    expect(c2.intervalDays).toBe(6);
    const c3 = scheduleReview(c2, 4, NOW);
    expect(c3.intervalDays).toBeGreaterThan(6); // 6 × ease
    expect(c3.ease).toBeCloseTo(2.5, 10); // q=4 leaves ease unchanged
    expect(c3.intervalDays).toBe(15); // round(6 × 2.5)
    expect(c3.reps).toBe(3);
    expect(c3.dueAt).toBe(NOW + 15 * DAY);
  });
  it("resets the interval on a lapse and floors the ease at 1.3", () => {
    const passed = scheduleReview(scheduleReview(newCard(NOW), 5, NOW), 5, NOW);
    const lapsed = scheduleReview(passed, 1, NOW);
    expect(lapsed.reps).toBe(0);
    expect(lapsed.intervalDays).toBe(1);
    let c = newCard(NOW);
    for (let i = 0; i < 10; i++) c = scheduleReview(c, 3, NOW);
    expect(c.ease).toBeGreaterThanOrEqual(1.3);
  });
  it("maps answers to qualities", () => {
    expect(qualityFromAnswer(false)).toBeLessThan(3);
    expect(qualityFromAnswer(true)).toBeGreaterThanOrEqual(3);
    expect(qualityFromAnswer(true, { fast: true })).toBe(5);
  });
});

describe("learner model", () => {
  it("updates mastery + counts immutably and tracks mastery", () => {
    const m0 = emptyModel();
    const m1 = applyResult(m0, "add10", true, NOW);
    expect(m0.kcs.add10).toBeUndefined(); // immutable
    expect(m1.kcs.add10!.attempts).toBe(1);
    expect(m1.kcs.add10!.correct).toBe(1);
    expect(masteryOf(m1, "add10")).toBeGreaterThan(0.25);

    let m = emptyModel();
    for (let i = 0; i < 6; i++) m = applyResult(m, "add10", true, NOW);
    expect(isKcMastered(m, "add10")).toBe(true);
  });

  it("reports weak skills (worst first) and due skills", () => {
    let m = emptyModel();
    m = applyResult(m, "regroup", false, NOW); // weak
    m = applyResult(m, "count", false, NOW);
    m = applyResult(m, "count", false, NOW); // weaker
    expect(weakKcs(m)[0]).toBe("count"); // lowest pKnown first
    expect(weakKcs(m)).toContain("regroup");
    // a lapsed card is due ~1 day later, not at NOW
    expect(dueKcs(m, NOW)).toEqual([]);
    expect(dueKcs(m, NOW + 2 * DAY)).toContain("regroup");
  });

  it("round-trips through serialization and tolerates garbage", () => {
    const m = applyResult(emptyModel(), "x", true, NOW);
    expect(deserializeModel(serializeModel(m))).toEqual(m);
    expect(deserializeModel("not json")).toEqual(emptyModel());
  });

  it("drops malformed/partial persisted entries instead of crashing consumers", () => {
    // an entry missing its card, plus a NaN-poisoned one, alongside a good entry
    const good = applyResult(emptyModel(), "ok", true, NOW);
    const blob = JSON.stringify({ kcs: { ...good.kcs, missingCard: { pKnown: 0.5, attempts: 1, correct: 1 }, bad: { pKnown: "x" } } });
    const m = deserializeModel(blob);
    expect(masteryOf(m, "ok")).toBeGreaterThan(0); // good entry kept
    expect(m.kcs.missingCard).toBeUndefined(); // malformed entries dropped
    expect(m.kcs.bad).toBeUndefined();
    expect(() => dueKcs(m, NOW + 99 * DAY)).not.toThrow();
  });

  it("handles a KC id that collides with an Object.prototype member", () => {
    for (const kc of ["__proto__", "toString", "constructor", "hasOwnProperty"]) {
      const m = applyResult(emptyModel(), kc, true, NOW);
      expect(Object.prototype.hasOwnProperty.call(m.kcs, kc)).toBe(true);
      expect(masteryOf(m, kc)).toBeGreaterThan(0.25);
      expect(() => dueKcs(m, NOW + 99 * DAY)).not.toThrow();
    }
  });
});

describe("recordCueResult", () => {
  it("updates the model for a graded cue with a kc, ignores ungraded / kc-less cues", () => {
    const cue = mcq({ id: "q", t: 1, prompt: "?", choices: ["a", "b"], answer: 1, kc: "add10" });
    const m = recordCueResult(emptyModel(), cue, gradeCue(cue, 1), NOW);
    expect(masteryOf(m, "add10")).toBeGreaterThan(0.25);
    // ungraded pausePrompt → unchanged
    const pp = pausePrompt({ id: "p", t: 1, prompt: "predict", kc: "add10" });
    expect(recordCueResult(emptyModel(), pp, gradeCue(pp, null), NOW)).toEqual(emptyModel());
    // no kc → unchanged
    const noKc = mcq({ id: "q2", t: 1, prompt: "?", choices: ["a", "b"], answer: 0 });
    expect(recordCueResult(emptyModel(), noKc, gradeCue(noKc, 0), NOW)).toEqual(emptyModel());
  });
});

describe("review reel", () => {
  it("interleaves weak/due skills and caps at max", () => {
    let m = emptyModel();
    m = applyResult(m, "add", false, NOW);
    m = applyResult(m, "sub", false, NOW);
    const pool = [
      mcq({ id: "a", t: 1, prompt: "?", choices: ["1", "2"], answer: 0, kc: "add" }),
      mcq({ id: "b", t: 1, prompt: "?", choices: ["1", "2"], answer: 0, kc: "add" }),
      mcq({ id: "c", t: 1, prompt: "?", choices: ["1", "2"], answer: 0, kc: "sub" }),
      mcq({ id: "d", t: 1, prompt: "?", choices: ["1", "2"], answer: 0, kc: "mult" }), // not in model → excluded
    ];
    const reel = buildReviewReel(m, pool, NOW, { max: 4 });
    expect(reel.map((c) => c.kc)).toEqual(["add", "sub", "add"]); // interleaved; mult excluded; add has 2, sub 1
    expect(buildReviewReel(m, pool, NOW, { max: 1 }).length).toBe(1);
  });
});
