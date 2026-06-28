/**
 * OpenAI cloud Text-To-Speech provider — turns a narration line into PCM via
 * OpenAI's `POST /audio/speech` endpoint (`response_format: "pcm"`, which returns
 * raw headerless 24000 Hz 16-bit mono little-endian PCM). The bytes are decoded and
 * resampled to the engine's SAMPLE_RATE so the result drops in behind the existing
 * `TtsProvider` interface — frames are unaffected by audio.
 *
 * Network-free by construction for tests: the constructor accepts an injectable
 * `fetchImpl`, and the synthesis path retries transient failures (HTTP 429 / 5xx /
 * network / timeout) via the shared `withRetry` helper. The API key is never placed
 * in an error message or log.
 */

import type { SynthesizedSpeech, TtsProvider } from "../tts.js";
import { SAMPLE_RATE, silencePcm } from "../wav.js";
import { chunkText, normalizeTtsText, pcmBytesToInt16, resamplePcm, withRetry } from "../ttsUtil.js";

/** OpenAI's `response_format: "pcm"` is fixed at 24 kHz, 16-bit mono, little-endian. */
const OPENAI_PCM_RATE = 24_000;
/** Max characters per request; longer text is split and concatenated. */
const MAX_CHARS = 4000;

export interface OpenAiTtsOptions {
  /** API key; falls back to OPENAI_API_KEY. */
  apiKey?: string;
  /** TTS model; falls back to OPENAI_TTS_MODEL, then "gpt-4o-mini-tts". */
  model?: string;
  /** Default voice; falls back to OPENAI_TTS_VOICE, then "nova". Overridable per call. */
  voice?: string;
  /** Output sample rate; defaults to the engine SAMPLE_RATE (22050). */
  sampleRate?: number;
  /** API base URL; falls back to OPENAI_BASE_URL, then "https://api.openai.com/v1". */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 30000. */
  timeoutMs?: number;
  /** Base backoff in ms passed to withRetry. Default 400; set 0 in tests for speed. */
  retryDelayMs?: number;
  /** Injectable fetch (CRITICAL for network-free unit tests). */
  fetchImpl?: typeof fetch;
}

/** Marker for errors that withRetry should retry (transient: 429 / 5xx / network / timeout). */
class RetryableTtsError extends Error {}

/** Concatenate Int16Array chunks into one contiguous buffer. */
function concatInt16(parts: readonly Int16Array[]): Int16Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Int16Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export class OpenAiTtsProvider implements TtsProvider {
  readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly voice: string;
  private readonly sampleRate: number;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAiTtsOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model = opts.model ?? process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
    this.voice = opts.voice ?? process.env.OPENAI_TTS_VOICE ?? "nova";
    this.sampleRate = opts.sampleRate ?? SAMPLE_RATE;
    this.baseUrl = (opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.retryDelayMs = opts.retryDelayMs ?? 400;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (!this.apiKey) throw new Error("OpenAiTtsProvider requires OPENAI_API_KEY");
    this.id = `openai:${this.model}:${this.voice}:${this.sampleRate}`;
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<SynthesizedSpeech> {
    const t = normalizeTtsText(text);
    if (t === "") {
      // Empty-text fallback: a short beat of silence, no network call.
      const pcm = silencePcm(0.3, this.sampleRate);
      return { pcm, sampleRate: this.sampleRate, durationSec: pcm.length / this.sampleRate };
    }

    const voice = opts?.voice ?? this.voice;

    let pcm: Int16Array;
    if (t.length > MAX_CHARS) {
      const parts: Int16Array[] = [];
      for (const chunk of chunkText(t, MAX_CHARS)) parts.push(await this.synthesizeChunk(chunk, voice));
      pcm = concatInt16(parts);
    } else {
      pcm = await this.synthesizeChunk(t, voice);
    }

    return { pcm, sampleRate: this.sampleRate, durationSec: pcm.length / this.sampleRate };
  }

  /** One HTTP request → decoded + resampled PCM, with transient-failure retries. */
  private async synthesizeChunk(input: string, voice: string): Promise<Int16Array> {
    return withRetry(
      async () => {
        let res: Response;
        try {
          res = await this.fetchImpl(`${this.baseUrl}/audio/speech`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({ model: this.model, voice, input, response_format: "pcm" }),
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (err) {
          const e = err as Error;
          if (e.name === "TimeoutError" || e.name === "AbortError") {
            throw new RetryableTtsError(`OpenAiTtsProvider request timed out after ${this.timeoutMs}ms`);
          }
          // Network-level failure (DNS, connection reset, ...) — transient, retry.
          throw new RetryableTtsError(`OpenAiTtsProvider request failed: ${e.message}`);
        }

        if (!res.ok) {
          const retryable = res.status === 429 || res.status >= 500;
          const message = `OpenAiTtsProvider request failed with status ${res.status}`;
          throw retryable ? new RetryableTtsError(message) : new Error(message);
        }

        const bytes = new Uint8Array(await res.arrayBuffer());
        const pcm = resamplePcm(pcmBytesToInt16(bytes), OPENAI_PCM_RATE, this.sampleRate);
        if (pcm.length === 0) throw new Error("OpenAiTtsProvider received an empty audio response");
        return pcm;
      },
      (err) => err instanceof RetryableTtsError,
      { baseDelayMs: this.retryDelayMs },
    );
  }
}
