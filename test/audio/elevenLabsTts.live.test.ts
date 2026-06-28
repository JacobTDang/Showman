import { describe, it, expect } from "vitest";
import { ElevenLabsTtsProvider } from "../../src/audio/providers/elevenLabsTts.js";
import { SAMPLE_RATE } from "../../src/audio/wav.js";

/**
 * LIVE test against ElevenLabs — runs ONLY when ELEVENLABS_API_KEY is set, so it is
 * skipped in the default suite (no key, no cost). Proves the provider really turns a
 * phrase into engine-rate PCM. Use `npm run test:live`.
 */
const hasKey = !!process.env.ELEVENLABS_API_KEY;

describe.skipIf(!hasKey)("ElevenLabs live TTS", () => {
  it("synthesizes a spoken phrase to non-empty PCM at the engine sample rate", async () => {
    const provider = new ElevenLabsTtsProvider({});
    const out = await provider.synthesize("Let's count to three together, one, two, three!");

    expect(out.pcm.length).toBeGreaterThan(0);
    expect(out.sampleRate).toBe(SAMPLE_RATE);
    expect(out.durationSec).toBeGreaterThan(0.3);
  }, 60_000);
});
