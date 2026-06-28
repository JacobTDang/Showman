import { describe, it, expect } from "vitest";
import { softLimitMix } from "../../src/audio/loudness.js";
import { measureNarration, fitSceneDuration, synthesizeNarration } from "../../src/audio/tts.js";
import { SilentTtsProvider, SAMPLE_RATE } from "../../src/index.js";

describe("softLimitMix (wide-buffer limiter — overlapping clips don't hard-clip)", () => {
  it("passes in-range sums through unchanged", () => {
    expect(Array.from(softLimitMix(Float64Array.from([0, 1000, -2000, 30000])))).toEqual([0, 1000, -2000, 30000]);
  });
  it("compresses an over-range sum to within ±32767 (a gentle limit, not a hard clip)", () => {
    const out = softLimitMix(Float64Array.from([52000, -52000]));
    expect(out[0]!).toBeLessThanOrEqual(32767);
    expect(out[0]!).toBeGreaterThan(30000); // limited but still loud
    expect(out[1]!).toBeGreaterThanOrEqual(-32767);
  });
  it("is monotonic in magnitude and treats non-finite as silence", () => {
    expect(softLimitMix(Float64Array.from([80000]))[0]!).toBeGreaterThanOrEqual(softLimitMix(Float64Array.from([40000]))[0]!);
    expect(softLimitMix(Float64Array.from([NaN, Infinity]))[0]).toBe(0);
  });
});

describe("measureNarration + fitSceneDuration", () => {
  it("returns per-segment durations and the required total (ascending t)", async () => {
    const { segmentDurations, requiredDuration } = await measureNarration(new SilentTtsProvider(), {
      segments: [
        { t: 2, text: "two two two" },
        { t: 0, text: "zero" },
      ],
    });
    expect(segmentDurations.length).toBe(2);
    expect(requiredDuration).toBeGreaterThan(2); // max(t + dur) past the last start
  });

  it("ignores a non-finite segment start so the required duration stays finite (farm protection)", async () => {
    const { requiredDuration } = await measureNarration(new SilentTtsProvider(), {
      segments: [
        { t: Infinity, text: "boom" },
        { t: 0, text: "ok" },
      ],
    });
    expect(Number.isFinite(requiredDuration)).toBe(true);
  });

  it("fitSceneDuration never shrinks the scene and pads the tail", () => {
    expect(fitSceneDuration(5, 3)).toBe(5);
    expect(fitSceneDuration(5, 10, 0.4)).toBeCloseTo(10.4, 5);
  });
});

describe("synthesizeNarration (float mix)", () => {
  it("stays silent + a WAV of the scene length for a silent provider", async () => {
    const { wav } = await synthesizeNarration(
      new SilentTtsProvider(),
      {
        segments: [
          { t: 0, text: "a" },
          { t: 1, text: "b" },
        ],
      },
      3,
    );
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.readUInt32LE(40)).toBe(Math.round(3 * SAMPLE_RATE) * 2);
  });
});
