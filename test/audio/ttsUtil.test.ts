import { describe, it, expect } from "vitest";
import { pcmBytesToInt16, int16ToBytes, resamplePcm, normalizeTtsText, chunkText, withRetry } from "../../src/audio/ttsUtil.js";

describe("pcmBytesToInt16", () => {
  it("decodes little-endian 16-bit samples", () => {
    // 1 (0x0001), -1 (0xFFFF), 256 (0x0100) little-endian
    const bytes = new Uint8Array([0x01, 0x00, 0xff, 0xff, 0x00, 0x01]);
    expect(Array.from(pcmBytesToInt16(bytes))).toEqual([1, -1, 256]);
  });
  it("drops a trailing odd byte", () => {
    const bytes = new Uint8Array([0x01, 0x00, 0x05]);
    expect(pcmBytesToInt16(bytes).length).toBe(1);
  });
  it("round-trips through int16ToBytes", () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768, 256]);
    expect(Array.from(pcmBytesToInt16(int16ToBytes(pcm)))).toEqual(Array.from(pcm));
  });
});

describe("resamplePcm", () => {
  it("is identity when rates match", () => {
    const pcm = new Int16Array([1, 2, 3]);
    expect(resamplePcm(pcm, 22050, 22050)).toBe(pcm);
  });
  it("downsamples 24000 -> 22050 with the right length and finite samples", () => {
    const pcm = new Int16Array(24000).map((_, i) => Math.round(1000 * Math.sin(i / 50)));
    const out = resamplePcm(pcm, 24000, 22050);
    expect(out.length).toBe(Math.round(24000 / (24000 / 22050)));
    expect(out.length).toBe(22050);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
  });
  it("returns input unchanged for bad rates", () => {
    const pcm = new Int16Array([1, 2]);
    expect(resamplePcm(pcm, 0, 22050)).toBe(pcm);
    expect(resamplePcm(pcm, 24000, NaN)).toBe(pcm);
  });
});

describe("normalizeTtsText", () => {
  it("collapses whitespace, strips control chars, trims", () => {
    expect(normalizeTtsText("  hello\t\nworld  ")).toBe("hello world");
  });
  it("is stable (idempotent) for caching", () => {
    const a = normalizeTtsText("Let's   count\nto 3!");
    expect(normalizeTtsText(a)).toBe(a);
  });
});

describe("chunkText", () => {
  it("returns [] for empty/whitespace", () => {
    expect(chunkText("   ")).toEqual([]);
  });
  it("returns one chunk when short", () => {
    expect(chunkText("hello world", 100)).toEqual(["hello world"]);
  });
  it("splits long text into chunks within the limit, preserving content length", () => {
    const sentence = "This is a sentence. ";
    const long = sentence.repeat(50).trim();
    const chunks = chunkText(long, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 80)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ").length).toBeGreaterThanOrEqual(long.length - chunks.length);
  });
});

describe("withRetry", () => {
  it("retries retryable failures then succeeds", async () => {
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("429");
        return "ok";
      },
      () => true,
      { baseDelayMs: 0 },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });
  it("does not retry non-retryable failures", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("401");
        },
        (e) => !String((e as Error).message).includes("401"),
        { baseDelayMs: 0 },
      ),
    ).rejects.toThrow("401");
    expect(calls).toBe(1);
  });
  it("gives up after the retry budget", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("503");
        },
        () => true,
        { retries: 2, baseDelayMs: 0 },
      ),
    ).rejects.toThrow("503");
    expect(calls).toBe(3); // 1 + 2 retries
  });
});
