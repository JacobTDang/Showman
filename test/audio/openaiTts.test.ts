import { describe, it, expect, vi } from "vitest";
import { OpenAiTtsProvider } from "../../src/audio/providers/openaiTts.js";
import { SAMPLE_RATE } from "../../src/audio/wav.js";

/** 4800 bytes = 2400 samples @ 24000 Hz = 0.1s of (fake) PCM. */
function pcmResponse(byteLen = 4800): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(byteLen),
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function makeProvider(fetchImpl: ReturnType<typeof vi.fn>): OpenAiTtsProvider {
  return new OpenAiTtsProvider({ apiKey: "test-key", fetchImpl: fetchImpl as unknown as typeof fetch, retryDelayMs: 0 });
}

describe("OpenAiTtsProvider", () => {
  it("synthesizes text to PCM at the engine sample rate and calls the speech endpoint", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => pcmResponse(4800));
    const tts = makeProvider(fetchImpl);

    const s = await tts.synthesize("hi");

    expect(s.sampleRate).toBe(SAMPLE_RATE);
    expect(s.pcm.length).toBeGreaterThan(0);
    expect(s.durationSec).toBe(s.pcm.length / SAMPLE_RATE);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/audio/speech");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer /);
    expect(String((init as RequestInit).body)).toContain('"response_format":"pcm"');
  });

  it("exposes a stable id keyed on model, voice, and sample rate", () => {
    const tts = new OpenAiTtsProvider({ apiKey: "k", model: "gpt-4o-mini-tts", voice: "nova" });
    expect(tts.id).toBe(`openai:gpt-4o-mini-tts:nova:${SAMPLE_RATE}`);
  });

  it("retries once on HTTP 429 then succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(errorResponse(429)).mockResolvedValueOnce(pcmResponse(4800));
    const tts = makeProvider(fetchImpl);

    const s = await tts.synthesize("hi");

    expect(s.pcm.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry on a 401 and rejects", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => errorResponse(401));
    const tts = makeProvider(fetchImpl);

    await expect(tts.synthesize("hi")).rejects.toThrow(/401/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects with a timeout message when the request times out", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => {
      const e = new Error("aborted");
      e.name = "TimeoutError";
      throw e;
    });
    const tts = makeProvider(fetchImpl);

    await expect(tts.synthesize("hi")).rejects.toThrow(/timed out/i);
  });

  it("returns silence without calling fetch for empty / whitespace text", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => pcmResponse(4800));
    const tts = makeProvider(fetchImpl);

    const empty = await tts.synthesize("");
    const blank = await tts.synthesize("   ");

    expect(empty.pcm.length).toBeGreaterThan(0);
    expect(empty.sampleRate).toBe(SAMPLE_RATE);
    expect(blank.pcm.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(0);
  });

  it("honors a per-call voice override in the request body", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => pcmResponse(4800));
    const tts = makeProvider(fetchImpl);

    await tts.synthesize("hi", { voice: "shimmer" });

    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(String(init.body)).toContain('"voice":"shimmer"');
  });
});
