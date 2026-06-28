/**
 * TTS provider selection — mirrors `createDefaultAuthor`: an explicit
 * `SHOWMAN_TTS_PROVIDER` override wins, else the first cloud key present
 * (`OPENAI_API_KEY` > `ELEVENLABS_API_KEY`), else the offline tone provider so demos
 * still have sound with no key. Cloud providers are wrapped in a content-addressed
 * disk cache (reproducible + free on repeat + idempotent across retries).
 */

import type { TtsProvider } from "./tts.js";
import { SilentTtsProvider, ToneTtsProvider } from "./tts.js";
import { CachingTtsProvider } from "./ttsCache.js";
import { OpenAiTtsProvider } from "./providers/openaiTts.js";
import { ElevenLabsTtsProvider } from "./providers/elevenLabsTts.js";

export type TtsEnv = Record<string, string | undefined>;

/** Pick a TTS provider from `env` (defaults to process.env). Pure selection — no network. */
export function createTts(env: TtsEnv = process.env): TtsProvider {
  const forced = env.SHOWMAN_TTS_PROVIDER?.trim().toLowerCase();
  const voice = env.SHOWMAN_TTS_VOICE?.trim() || undefined;
  const model = env.SHOWMAN_TTS_MODEL?.trim() || undefined;
  const cacheDir = env.SHOWMAN_TTS_CACHE?.trim() || undefined;
  const cache = (p: TtsProvider): TtsProvider => new CachingTtsProvider(p, cacheDir ? { dir: cacheDir } : {});

  const openai = (): TtsProvider =>
    cache(
      new OpenAiTtsProvider({
        ...(env.OPENAI_API_KEY ? { apiKey: env.OPENAI_API_KEY } : {}),
        ...(voice ? { voice } : {}),
        ...(model ? { model } : {}),
      }),
    );
  const eleven = (): TtsProvider =>
    cache(
      new ElevenLabsTtsProvider({
        ...(env.ELEVENLABS_API_KEY ? { apiKey: env.ELEVENLABS_API_KEY } : {}),
        ...(voice ? { voiceId: voice } : {}),
        ...(model ? { model } : {}),
      }),
    );

  switch (forced) {
    case "openai":
      return openai();
    case "elevenlabs":
      return eleven();
    case "tone":
      return new ToneTtsProvider();
    case "silent":
      return new SilentTtsProvider();
  }
  if (env.OPENAI_API_KEY) return openai();
  if (env.ELEVENLABS_API_KEY) return eleven();
  return new ToneTtsProvider();
}

/** The default provider for scripts and services (reads process.env). */
export function createDefaultTts(): TtsProvider {
  return createTts();
}
