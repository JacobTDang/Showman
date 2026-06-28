import { describe, it, expect } from "vitest";
import { captionsFromNarration, toSRT } from "../../src/audio/captions.js";

describe("caption refinement (wrapping + reading speed)", () => {
  it("wraps a long narration line into readable lines (same words, in order)", () => {
    const long = "Up two for every step you take to the right along the bottom of the grid";
    const cues = captionsFromNarration({ segments: [{ t: 0, text: long }] }, 10);
    const text = cues[0]!.text;
    expect(text).toContain("\n");
    expect(text.split("\n").length).toBeLessThanOrEqual(2);
    expect(text.split("\n")[0]!.length).toBeLessThanOrEqual(42);
    expect(text.replace(/\n/g, " ")).toBe(long);
  });

  it("keeps a too-short clip up for a minimum readable time, without overlapping the next cue", () => {
    // First clip is only 0.2s of audio — too short to read; the floor lifts it, capped by the next cue at t=5.
    const cues = captionsFromNarration(
      {
        segments: [
          { t: 0, text: "Hello there friend" },
          { t: 5, text: "next" },
        ],
      },
      10,
      [0.2, 0.5],
    );
    expect(cues[0]!.end - cues[0]!.start).toBeGreaterThanOrEqual(0.7);
    expect(cues[0]!.end).toBeLessThanOrEqual(5);
  });

  it("still extends a cue to the next segment when no duration is known (regression)", () => {
    const cues = captionsFromNarration(
      {
        segments: [
          { t: 0, text: "Hi" },
          { t: 1.5, text: "x" },
        ],
      },
      4,
    );
    expect(cues[0]!.end).toBeCloseTo(1.5, 5);
  });

  it("SRT is emitted with numbered, comma-millisecond cues", () => {
    const srt = toSRT(captionsFromNarration({ segments: [{ t: 0, text: "a" }] }, 2));
    expect(srt).toContain("1\n");
    expect(srt).toMatch(/00:00:00,000 --> /);
  });

  it("sanitizes '-->' in narration text so it can't break the WebVTT/SRT payload", () => {
    const cues = captionsFromNarration({ segments: [{ t: 0, text: "x --> y" }] }, 2);
    expect(cues[0]!.text).not.toContain("-->");
    expect(cues[0]!.text).toContain("→");
  });

  it("drops empty/whitespace-only segments (no blank-payload cue)", () => {
    const cues = captionsFromNarration(
      {
        segments: [
          { t: 0, text: "   " },
          { t: 1, text: "real" },
        ],
      },
      3,
    );
    expect(cues.map((c) => c.text)).toEqual(["real"]);
  });
});
