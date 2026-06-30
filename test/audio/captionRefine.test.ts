import { describe, it, expect } from "vitest";
import { captionsFromNarration, toSRT, toVTT } from "../../src/audio/captions.js";

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

  it("extends a too-short clip to its reading time (17 chars/sec), clamped to the next cue", () => {
    // The 0.2s of audio is too short to read; the cue extends to the reading-speed duration —
    // "Hello there friend" is 18 chars → 18/17 ≈ 1.059s (NOT merely the 0.7 floor) — capped by the next cue at t=5.
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
    expect(cues[0]!.end - cues[0]!.start).toBeCloseTo(18 / 17, 5); // exact reading-speed extension
    expect(cues[0]!.end).toBeLessThanOrEqual(5); // never overlaps the next cue
  });

  it("applies the 0.7s floor to a very short cue (reading time below the floor)", () => {
    const cues = captionsFromNarration(
      {
        segments: [
          { t: 0, text: "Hi" }, // 2/17 ≈ 0.12s < 0.7 floor
          { t: 5, text: "next" },
        ],
      },
      10,
      [0.1, 0.5],
    );
    expect(cues[0]!.end - cues[0]!.start).toBeCloseTo(0.7, 5); // the floor, not the reading speed, wins here
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
    const srt = toSRT(
      captionsFromNarration(
        {
          segments: [
            { t: 0, text: "a" },
            { t: 1, text: "b" },
          ],
        },
        2,
      ),
    );
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,000\na"); // full first block: number + comma-ms + arrow
    expect(srt).toContain("2\n00:00:01,000 --> 00:00:02,000\nb"); // second cue is numbered 2
  });

  it("VTT is emitted with a WEBVTT header and dot-millisecond cues", () => {
    const vtt = toVTT(
      captionsFromNarration(
        {
          segments: [
            { t: 0, text: "a" },
            { t: 1, text: "b" },
          ],
        },
        2,
      ),
    );
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toMatch(/00:00:00\.000 --> 00:00:01\.000/); // dot separator (not comma), per the WebVTT spec
    expect(vtt.endsWith("\n")).toBe(true);
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
