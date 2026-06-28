import { describe, it, expect } from "vitest";
import { createTts } from "../../src/audio/ttsFactory.js";
import { ToneTtsProvider, SilentTtsProvider } from "../../src/audio/tts.js";

const id = (p: unknown) => (p as { id?: string }).id;

describe("createTts selection (pure, no network)", () => {
  it("defaults to the tone provider with no keys", () => {
    expect(createTts({})).toBeInstanceOf(ToneTtsProvider);
  });

  it("uses OpenAI when OPENAI_API_KEY is set (wrapped in cache, so id passes through)", () => {
    expect(id(createTts({ OPENAI_API_KEY: "x" }))).toMatch(/^openai:/);
  });

  it("uses ElevenLabs when only ELEVENLABS_API_KEY is set", () => {
    expect(id(createTts({ ELEVENLABS_API_KEY: "y" }))).toMatch(/^elevenlabs:/);
  });

  it("prefers OpenAI over ElevenLabs when both are present", () => {
    expect(id(createTts({ OPENAI_API_KEY: "x", ELEVENLABS_API_KEY: "y" }))).toMatch(/^openai:/);
  });

  it("honors the SHOWMAN_TTS_PROVIDER override", () => {
    expect(createTts({ SHOWMAN_TTS_PROVIDER: "silent", OPENAI_API_KEY: "x" })).toBeInstanceOf(SilentTtsProvider);
    expect(createTts({ SHOWMAN_TTS_PROVIDER: "tone" })).toBeInstanceOf(ToneTtsProvider);
    expect(id(createTts({ SHOWMAN_TTS_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "y" }))).toMatch(/^elevenlabs:/);
  });

  it("selects local Kokoro on override (no key needed)", () => {
    expect(id(createTts({ SHOWMAN_TTS_PROVIDER: "kokoro" }))).toMatch(/^kokoro:/);
  });

  it("threads voice + model into the provider id", () => {
    expect(id(createTts({ OPENAI_API_KEY: "x", SHOWMAN_TTS_VOICE: "fable", SHOWMAN_TTS_MODEL: "tts-1" }))).toBe("openai:tts-1:fable:22050");
  });
});
