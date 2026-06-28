import { describe, it, expect } from "vitest";
import { peakAmplitude, normalizePcm, softLimit } from "../../src/audio/loudness.js";

describe("peakAmplitude", () => {
  it("returns ~1.0 for a full-scale buffer", () => {
    expect(peakAmplitude(new Int16Array([0, 16384, -32767]))).toBeCloseTo(1, 4);
  });
  it("is 0 for empty and all-zero buffers", () => {
    expect(peakAmplitude(new Int16Array(0))).toBe(0);
    expect(peakAmplitude(new Int16Array([0, 0, 0]))).toBe(0);
  });
  it("scales linearly with magnitude", () => {
    expect(peakAmplitude(new Int16Array([0, 1000, -500]))).toBeCloseTo(1000 / 32767, 6);
  });
});

describe("normalizePcm", () => {
  it("brings a quiet signal up to the target peak (within ±2)", () => {
    const out = normalizePcm(new Int16Array([0, 1000, -500]), 0.89);
    const expected = Math.round(0.89 * 32767);
    expect(Math.abs(peakAmplitudeRaw(out) - expected)).toBeLessThanOrEqual(2);
  });
  it("returns a new array (does not mutate input)", () => {
    const input = new Int16Array([0, 1000, -500]);
    const out = normalizePcm(input);
    expect(out).not.toBe(input);
    expect(Array.from(input)).toEqual([0, 1000, -500]);
  });
  it("leaves an all-zero/empty buffer unchanged", () => {
    const zero = new Int16Array([0, 0, 0]);
    expect(normalizePcm(zero)).toBe(zero);
    const empty = new Int16Array(0);
    expect(normalizePcm(empty)).toBe(empty);
  });
  it("does not amplify a signal already at/above the target", () => {
    const hot = new Int16Array([0, 32767, -32767]);
    expect(normalizePcm(hot, 0.89)).toBe(hot);
  });
});

describe("softLimit", () => {
  it("leaves in-range samples untouched", () => {
    const input = new Int16Array([0, 1000, -1000, 20000, -20000]);
    expect(Array.from(softLimit(input, 0.92))).toEqual([0, 1000, -1000, 20000, -20000]);
  });
  it("maps out-of-range-ish samples to within ±32767", () => {
    const out = softLimit(new Int16Array([32767, -32767, 32000, -32000]), 0.92);
    expect(out.every((v) => Math.abs(v) <= 32767)).toBe(true);
    expect(Math.abs(out[0]!)).toBeLessThan(32767);
  });
  it("is monotonic: larger input magnitude -> >= output magnitude", () => {
    let prev = -1;
    for (let s = 0; s <= 32767; s += 137) {
      const mag = Math.abs(softLimit(new Int16Array([s]), 0.92)[0]!);
      expect(mag).toBeGreaterThanOrEqual(prev);
      prev = mag;
    }
  });
  it("preserves sign", () => {
    const out = softLimit(new Int16Array([32767, -32767]), 0.92);
    expect(out[0]!).toBeGreaterThan(0);
    expect(out[1]!).toBeLessThan(0);
  });
  it("returns a new array", () => {
    const input = new Int16Array([32767]);
    expect(softLimit(input)).not.toBe(input);
  });
});

/** Raw peak in sample units (not normalized) for asserting absolute targets. */
function peakAmplitudeRaw(pcm: Int16Array): number {
  let maxAbs = 0;
  for (let i = 0; i < pcm.length; i++) maxAbs = Math.max(maxAbs, Math.abs(pcm[i]!));
  return maxAbs;
}
