import { describe, it, expect } from "vitest";
import { wrapCaption, minReadableDuration } from "../../src/audio/captionFormat.js";

describe("wrapCaption", () => {
  it("returns a short line unchanged (no newline)", () => {
    const out = wrapCaption("We counted 3 apples!"); // 20 chars
    expect(out).toBe("We counted 3 apples!");
    expect(out).not.toContain("\n");
  });

  it("collapses internal whitespace before wrapping", () => {
    expect(wrapCaption("We   counted\n3\tapples!")).toBe("We counted 3 apples!");
  });

  it("wraps a long sentence into at most 2 lines within the width, preserving word order", () => {
    const sentence = "The little fox jumped over the lazy brown dog and ran away.";
    expect(sentence.length).toBeGreaterThan(42);
    const out = wrapCaption(sentence, 42, 2);
    const lines = out.split("\n");
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(42);
    // Re-joining the lines reproduces the original words in order.
    expect(out.split(/\s+/)).toEqual(sentence.split(/\s+/));
  });

  it("never splits a single over-long word (it may exceed the width)", () => {
    const word = "supercalifragilisticexpialidocious"; // 34 chars
    const out = wrapCaption(`a ${word} b`, 10, 3);
    const lines = out.split("\n");
    expect(lines).toContain(word);
    expect(out.split(/\s+/)).toEqual(["a", word, "b"]);
  });

  it("packs the remainder onto the last line when more lines are needed", () => {
    const text = "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
    const out = wrapCaption(text, 12, 2);
    const lines = out.split("\n");
    expect(lines.length).toBe(2);
    // No words are lost when overflow is packed onto the final line.
    expect(out.split(/\s+/)).toEqual(text.split(/\s+/));
  });
});

describe("minReadableDuration", () => {
  it("applies the floor for very short text", () => {
    expect(minReadableDuration("hi", 17, 0.7)).toBe(0.7);
  });

  it("uses ~5.0s for an 85-char string at 17 cps", () => {
    const text = "a".repeat(85);
    expect(minReadableDuration(text)).toBeCloseTo(5.0, 1);
  });

  it("scales up with length", () => {
    const short = "a".repeat(85);
    const long = "a".repeat(170);
    expect(minReadableDuration(long)).toBeGreaterThan(minReadableDuration(short));
    expect(minReadableDuration(long)).toBeCloseTo(10.0, 1);
  });

  it("excludes line breaks from the readable length (above the floor, so it's not vacuous)", () => {
    const wrapped = "a".repeat(40) + "\n" + "a".repeat(40); // 80 letters across two lines
    const flat = "a".repeat(80);
    expect(minReadableDuration(wrapped)).toBeGreaterThan(0.7); // clears the floor, so length drives it
    expect(minReadableDuration(wrapped)).toBeCloseTo(minReadableDuration(flat), 5); // the newline isn't counted
  });
});
