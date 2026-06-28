import { describe, it, expect, vi } from "vitest";
import { ElevenLabsTtsProvider } from "../../src/audio/providers/elevenLabsTts.js";
import { SAMPLE_RATE } from "../../src/audio/wav.js";

const VOICE = "TestVoiceId123";

/** A minimal Response stand-in carrying `byteLen` raw PCM bytes (all zero == silence). */
function pcmResponse(byteLen: number, status = 200): Response {
  const bytes = new Uint8Array(byteLen);
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => "error body",
  } as unknown as Response;
}

describe("ElevenLabsTtsProvider", () => {
  it("synthesizes raw 22050 PCM with no resample (fast path)", async () => {
    // 4410 bytes = 2205 samples = 0.1s at 22050 Hz.
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => pcmResponse(4410));
    const provider = new ElevenLabsTtsProvider({
      apiKey: "secret-key",
      voiceId: VOICE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const out = await provider.synthesize("hi");

    expect(out.sampleRate).toBe(SAMPLE_RATE);
    expect(out.pcm.length).toBe(2205);
    expect(out.durationSec).toBe(out.pcm.length / SAMPLE_RATE);
    expect(out.durationSec).toBeCloseTo(0.1, 10);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0]!;
    const url = String(call[0]);
    const init = call[1] as RequestInit;
    expect(url).toContain(VOICE);
    expect(url).toContain("output_format=pcm_22050");
    const headers = init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("secret-key");
    expect(headers["accept"]).toBe("audio/pcm");
    expect(JSON.parse(String(init.body))).toMatchObject({ text: "hi", model_id: "eleven_turbo_v2_5" });
  });

  it("retries once on HTTP 429 then succeeds (two calls)", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(pcmResponse(0, 429)).mockResolvedValueOnce(pcmResponse(4410, 200));
    const provider = new ElevenLabsTtsProvider({
      apiKey: "k",
      voiceId: VOICE,
      retryDelayMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const out = await provider.synthesize("hi");

    expect(out.pcm.length).toBe(2205);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 401 and rejects after one call", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => pcmResponse(0, 401));
    const provider = new ElevenLabsTtsProvider({
      apiKey: "k",
      voiceId: VOICE,
      retryDelayMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.synthesize("hi")).rejects.toThrow(/401/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns 0.3s of silence without calling fetch for empty/whitespace text", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => pcmResponse(4410));
    const provider = new ElevenLabsTtsProvider({
      apiKey: "k",
      voiceId: VOICE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const out = await provider.synthesize("   \t\n  ");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.sampleRate).toBe(SAMPLE_RATE);
    expect(out.pcm.length).toBe(Math.round(0.3 * SAMPLE_RATE));
    expect(out.durationSec).toBeGreaterThan(0.29);
  });

  it("lets a per-call voice override the configured voiceId", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => pcmResponse(4410));
    const provider = new ElevenLabsTtsProvider({
      apiKey: "k",
      voiceId: VOICE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.synthesize("hi", { voice: "OverrideVoice99" });

    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url).toContain("OverrideVoice99");
    expect(url).not.toContain(VOICE);
  });

  it("exposes a stable cache id and throws without an API key", () => {
    const provider = new ElevenLabsTtsProvider({ apiKey: "k", voiceId: VOICE, model: "eleven_turbo_v2_5" });
    expect(provider.id).toBe(`elevenlabs:eleven_turbo_v2_5:${VOICE}:${SAMPLE_RATE}`);
    expect(() => new ElevenLabsTtsProvider({ apiKey: "" })).toThrow(/API key/);
  });
});
