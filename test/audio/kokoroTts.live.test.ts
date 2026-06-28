import { describe, it, expect } from "vitest";
import { KokoroTtsProvider } from "../../src/audio/providers/kokoroTts.js";
import { SAMPLE_RATE } from "../../src/audio/wav.js";

// Requires `npm install kokoro-js` and downloads the model on first run, so it is
// gated behind RUN_KOKORO_LIVE=1 (and excluded from CI like all *.live.test.ts).
const enabled = !!process.env.RUN_KOKORO_LIVE;

describe.skipIf(!enabled)("Kokoro TTS live (local model)", () => {
  it("synthesizes a phrase to real (non-silent) PCM on the available device", async () => {
    const tts = new KokoroTtsProvider({});
    const s = await tts.synthesize("Let's count to three.");
    expect(s.pcm.length).toBeGreaterThan(0);
    expect(s.sampleRate).toBe(SAMPLE_RATE);
    expect(s.durationSec).toBeGreaterThan(0.3);
    let peak = 0;
    for (const v of s.pcm) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(1000); // real audio, not silence
  }, 180_000);

  it("falls back to the default voice for an unknown voice hint (no crash)", async () => {
    const tts = new KokoroTtsProvider({});
    const s = await tts.synthesize("Hello.", { voice: "child-friendly" });
    expect(s.pcm.length).toBeGreaterThan(0);
  }, 180_000);
});
