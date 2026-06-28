import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { CachingTtsProvider } from "../../src/audio/ttsCache.js";
import { SAMPLE_RATE } from "../../src/audio/wav.js";
import { normalizeTtsText } from "../../src/audio/ttsUtil.js";
import type { TtsProvider, SynthesizedSpeech } from "../../src/audio/tts.js";

const SEP = String.fromCharCode(0); // NUL separator — must match the provider's key format.

/** Deterministic in-memory provider with a public call counter. */
class FakeProvider implements TtsProvider {
  readonly id = "fake:v1";
  calls = 0;
  async synthesize(text: string): Promise<SynthesizedSpeech> {
    this.calls++;
    const n = 100 + text.length * 10;
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) pcm[i] = (i * 7 + text.length) % 1000;
    return { pcm, sampleRate: SAMPLE_RATE, durationSec: pcm.length / SAMPLE_RATE };
  }
}

/** Recompute a cache key exactly as the provider does, to locate its files on disk. */
function keyFor(innerId: string, text: string, voice?: string): string {
  return createHash("sha256")
    .update(`${innerId}${SEP}${normalizeTtsText(text)}${SEP}${voice ?? ""}`)
    .digest("hex");
}

const dirs: string[] = [];
function tmpDir(): string {
  const d = join(os.tmpdir(), `showman-tts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

describe("CachingTtsProvider", () => {
  it("misses then hits: writes both files, then serves from cache without re-synth", async () => {
    const dir = tmpDir();
    const fake = new FakeProvider();
    const cache = new CachingTtsProvider(fake, { dir });

    const first = await cache.synthesize("count to three");
    expect(fake.calls).toBe(1);
    const key = keyFor(fake.id, "count to three");
    expect(existsSync(join(dir, key + ".pcm"))).toBe(true);
    expect(existsSync(join(dir, key + ".json"))).toBe(true);

    const second = await cache.synthesize("count to three");
    expect(fake.calls).toBe(1); // served from cache, no second synth
    expect(Array.from(second.pcm)).toEqual(Array.from(first.pcm));
    expect(second.durationSec).toBe(first.durationSec);
    expect(second.sampleRate).toBe(first.sampleRate);
  });

  it("keys vary by voice: different voices each hit the inner provider", async () => {
    const dir = tmpDir();
    const fake = new FakeProvider();
    const cache = new CachingTtsProvider(fake, { dir });

    await cache.synthesize("hello", { voice: "a" });
    expect(fake.calls).toBe(1);
    await cache.synthesize("hello", { voice: "b" });
    expect(fake.calls).toBe(2);

    // each voice is independently cached
    await cache.synthesize("hello", { voice: "a" });
    await cache.synthesize("hello", { voice: "b" });
    expect(fake.calls).toBe(2);
  });

  it("normalizes text: equivalent strings share a cache entry", async () => {
    const dir = tmpDir();
    const fake = new FakeProvider();
    const cache = new CachingTtsProvider(fake, { dir });

    await cache.synthesize("hi  there");
    expect(fake.calls).toBe(1);
    await cache.synthesize("hi there");
    expect(fake.calls).toBe(1); // normalized to the same key -> hit
  });

  it("re-synthesizes when the cached .pcm is corrupt", async () => {
    const dir = tmpDir();
    const fake = new FakeProvider();
    const cache = new CachingTtsProvider(fake, { dir });

    const first = await cache.synthesize("corrupt me");
    expect(fake.calls).toBe(1);

    const key = keyFor(fake.id, "corrupt me");
    writeFileSync(join(dir, key + ".pcm"), Buffer.from("garbage"));

    const second = await cache.synthesize("corrupt me");
    expect(fake.calls).toBe(2); // corruption detected -> miss -> re-synth
    expect(Array.from(second.pcm)).toEqual(Array.from(first.pcm)); // valid pcm again
    expect(second.pcm.length).toBeGreaterThan(0);
  });
});
