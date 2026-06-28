import { describe, it, expect } from "vitest";
import { OpenAiTtsProvider } from "../../src/audio/providers/openaiTts.js";
import { SAMPLE_RATE } from "../../src/audio/wav.js";

/**
 * LIVE test against OpenAI's TTS — runs ONLY when OPENAI_API_KEY is set, so it is
 * skipped in CI (no key, no cost). `*.live.test.ts` is excluded from the default run.
 */
const hasKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasKey)("OpenAI TTS live", () => {
  it("synthesizes a phrase to PCM", async () => {
    const tts = new OpenAiTtsProvider({});
    const s = await tts.synthesize("Let's count to three.");
    expect(s.pcm.length).toBeGreaterThan(0);
    expect(s.sampleRate).toBe(SAMPLE_RATE);
    expect(s.durationSec).toBeGreaterThan(0.3);
  }, 60000);
});
