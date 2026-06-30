import { describe, it, expect } from "vitest";
import { mcq, trueFalse, numeric, freeResponse, hotspot, pausePrompt, interactionTrack } from "../../src/interaction/builders.js";
import { gradeCue, dueCues, hitRegion, sortedCues, pauses } from "../../src/interaction/runtime.js";
import { validateInteractions } from "../../src/interaction/validate.js";

describe("gradeCue", () => {
  it("grades mcq with per-choice misconception feedback", () => {
    const cue = mcq({
      id: "q1",
      t: 5,
      prompt: "2+2?",
      choices: ["3", "4", "5"],
      answer: 1,
      feedback: ["too low", "", "too high"],
      explanation: "It's 4.",
    });
    expect(gradeCue(cue, 1)).toEqual({ correct: true, graded: true, feedback: "It's 4." });
    expect(gradeCue(cue, 0)).toEqual({ correct: false, graded: true, feedback: "too low" });
    expect(gradeCue(cue, 2).feedback).toBe("too high");
    expect(gradeCue(cue, -1).correct).toBe(false); // no response
    // A blank per-choice entry falls back to the general explanation (|| not ??).
    const blank = mcq({
      id: "q2",
      t: 1,
      prompt: "?",
      choices: ["a", "b", "c"],
      answer: 1,
      feedback: ["", "ok", ""],
      explanation: "Use the rule.",
    });
    expect(gradeCue(blank, 0).feedback).toBe("Use the rule.");
  });

  it("grades trueFalse, numeric (with tolerance), and freeResponse", () => {
    expect(gradeCue(trueFalse({ id: "t", t: 1, prompt: "?", answer: true }), true).correct).toBe(true);
    expect(gradeCue(trueFalse({ id: "t", t: 1, prompt: "?", answer: true }), false).correct).toBe(false);
    const n = numeric({ id: "n", t: 1, prompt: "pi?", answer: 3.14, tolerance: 0.01 });
    expect(gradeCue(n, 3.14).correct).toBe(true);
    expect(gradeCue(n, 3.15).correct).toBe(true);
    expect(gradeCue(n, 3.2).correct).toBe(false);
    expect(gradeCue(n, "nope" as unknown as number).correct).toBe(false);
    // Exactly-representable boundary (no float-format fragility): |0.75 − 0.5| = 0.25 == tolerance → pass;
    // just outside → fail. Pins the `<=` comparison in gradeCue.
    const n2 = numeric({ id: "n2", t: 1, prompt: "half?", answer: 0.5, tolerance: 0.25 });
    expect(gradeCue(n2, 0.75).correct).toBe(true); // diff exactly at tolerance
    expect(gradeCue(n2, 0.25).correct).toBe(true);
    expect(gradeCue(n2, 0.76).correct).toBe(false); // 0.26 > 0.25
    const fr = freeResponse({ id: "f", t: 1, prompt: "capital?", accept: ["Paris", "paris"] });
    expect(gradeCue(fr, "  PARIS ").correct).toBe(true);
    expect(gradeCue(fr, "London").correct).toBe(false);
  });

  it("grades hotspot by region and never grades pausePrompt", () => {
    const h = hotspot({
      id: "h",
      t: 1,
      prompt: "tap the circle",
      regions: [
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: 0, w: 10, h: 10, correct: true },
      ],
    });
    expect(gradeCue(h, 1).correct).toBe(true);
    expect(gradeCue(h, 0).correct).toBe(false);
    expect(gradeCue(pausePrompt({ id: "p", t: 1, prompt: "predict!" }), null)).toEqual({ correct: false, graded: false });
  });
});

describe("hitRegion", () => {
  it("returns the topmost region hit, or -1", () => {
    const cue = {
      regions: [
        { x: 0, y: 0, w: 50, h: 50 },
        { x: 10, y: 10, w: 20, h: 20 },
      ],
    };
    expect(hitRegion(cue, 15, 15)).toBe(1); // overlapping → last drawn wins
    expect(hitRegion(cue, 5, 5)).toBe(0);
    expect(hitRegion(cue, 100, 100)).toBe(-1);
  });
});

describe("cue scheduling", () => {
  const track = interactionTrack(
    mcq({ id: "b", t: 8, prompt: "?", choices: ["a", "b"], answer: 0 }),
    pausePrompt({ id: "a", t: 3, prompt: "predict" }),
    trueFalse({ id: "c", t: 8, prompt: "?", answer: true }),
  );
  it("sorts by time then id", () => {
    expect(sortedCues(track).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
  it("returns cues due in (fromT, toT]", () => {
    expect(dueCues(track, 0, 3).map((c) => c.id)).toEqual(["a"]);
    expect(dueCues(track, 3, 8).map((c) => c.id)).toEqual(["b", "c"]);
    expect(dueCues(track, 8, 20)).toEqual([]);
  });
  it("fires a t=0 cue in the opening (lastT=-1, t] window", () => {
    expect(dueCues(interactionTrack(pausePrompt({ id: "zero", t: 0, prompt: "x" })), -1, 0.5).map((c) => c.id)).toEqual(["zero"]);
  });
  it("pauses by default, respects pause:false", () => {
    expect(pauses(mcq({ id: "x", t: 1, prompt: "?", choices: ["a", "b"], answer: 0 }))).toBe(true);
    expect(pauses(pausePrompt({ id: "y", t: 1, prompt: "?", pause: false }))).toBe(false);
  });
});

describe("validateInteractions", () => {
  it("accepts a well-formed track, including a t=0 cue", () => {
    const t = interactionTrack(
      mcq({ id: "q1", t: 5, prompt: "2+2?", choices: ["3", "4"], answer: 1 }),
      pausePrompt({ id: "p0", t: 0, prompt: "go" }),
    );
    expect(validateInteractions(t, { duration: 10 })).toEqual([]);
  });
  it("rejects a cue at or after the video end", () => {
    const codes = validateInteractions(interactionTrack(mcq({ id: "q", t: 5, prompt: "?", choices: ["a", "b"], answer: 0 })), {
      duration: 5,
    }).map((e) => e.code);
    expect(codes).toContain("OUT_OF_RANGE"); // t === duration
  });
  it("flags duplicate ids, out-of-range answers/times, and missing fields", () => {
    const codes = (t: Parameters<typeof validateInteractions>[0], d?: number) =>
      validateInteractions(t, d ? { duration: d } : {}).map((e) => e.code);
    expect(
      codes(
        interactionTrack(
          mcq({ id: "x", t: 1, prompt: "?", choices: ["a", "b"], answer: 1 }),
          trueFalse({ id: "x", t: 2, prompt: "?", answer: true }),
        ),
      ),
    ).toContain("DUPLICATE_ID");
    expect(codes(interactionTrack(mcq({ id: "q", t: 1, prompt: "?", choices: ["a", "b"], answer: 5 })))).toContain("OUT_OF_RANGE");
    expect(codes(interactionTrack(mcq({ id: "q", t: 99, prompt: "?", choices: ["a", "b"], answer: 0 })), 10)).toContain("OUT_OF_RANGE");
    expect(codes(interactionTrack(mcq({ id: "", t: 1, prompt: "?", choices: ["a", "b"], answer: 0 })))).toContain("MISSING_FIELD");
    expect(codes(interactionTrack(hotspot({ id: "h", t: 1, prompt: "?", regions: [{ x: 0, y: 0, w: 10, h: 10 }] })))).toContain(
      "INVALID_VALUE",
    ); // no correct region
  });
});
