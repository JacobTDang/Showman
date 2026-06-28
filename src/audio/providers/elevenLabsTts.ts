/**
 * ElevenLabs cloud Text-To-Speech provider.
 *
 * Implements the engine's TtsProvider contract behind an injectable `fetchImpl`, so the
 * happy/edge paths are unit-tested with no network (a separate live test is gated behind
 * ELEVENLABS_API_KEY). With ElevenLabs' `pcm_<rate>` output formats the response body is
 * RAW little-endian 16-bit mono PCM — when the requested rate matches the engine sample
 * rate there is no decode/resample beyond the shared `pcmBytesToInt16` (the fast path).
 *
 * Frames are unaffected by audio; this only produces narration PCM. The API key is never
 * placed in an error message or log.
 */

import type { SynthesizedSpeech, TtsProvider } from "../tts.js";
import { SAMPLE_RATE, silencePcm } from "../wav.js";
import { chunkText, normalizeTtsText, pcmBytesToInt16, resamplePcm, withRetry } from "../ttsUtil.js";

export interface ElevenLabsTtsOptions {
  apiKey?: string;
  /** ElevenLabs voice id (a per-call `opts.voice` overrides this). */
  voiceId?: string;
  model?: string;
  /** Target engine sample rate. Native ElevenLabs rates (16000/24000/44100) avoid a resample. */
  sampleRate?: number;
  baseUrl?: string;
  timeoutMs?: number;
  /** Base backoff for retries (ms); set 0 in tests. Passed to withRetry's baseDelayMs. */
  retryDelayMs?: number;
  /** Injectable fetch (CRITICAL for network-free unit tests). */
  fetchImpl?: typeof fetch;
}

/** ElevenLabs `pcm_<rate>` output formats that return raw little-endian 16-bit mono PCM. */
const NATIVE_PCM_RATES = new Set([16_000, 22_050, 24_000, 44_100]);
const MAX_CHARS = 4000;

/** Carries whether a failed request should be retried, without leaking the API key. */
class ElevenLabsRequestError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = "ElevenLabsRequestError";
    this.retryable = retryable;
    this.status = status;
  }
}

const isRetryable = (err: unknown): boolean => err instanceof ElevenLabsRequestError && err.retryable;

function concatInt16(parts: Int16Array[]): Int16Array {
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

export class ElevenLabsTtsProvider implements TtsProvider {
  /** Stable cache key (the TTS cache keys on this). */
  readonly id: string;

  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly model: string;
  private readonly sampleRate: number;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  /** The ElevenLabs `output_format` we request, and the PCM rate it returns. */
  private readonly outputFormat: string;
  private readonly srcRate: number;

  constructor(opts: ElevenLabsTtsOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.ELEVENLABS_API_KEY ?? "";
    this.voiceId = opts.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
    this.model = opts.model ?? process.env.ELEVENLABS_MODEL ?? "eleven_turbo_v2_5";
    this.sampleRate = opts.sampleRate ?? SAMPLE_RATE;
    this.baseUrl = (opts.baseUrl ?? process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io/v1").replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.retryDelayMs = opts.retryDelayMs ?? 400;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (!this.apiKey) throw new Error("ElevenLabsTtsProvider requires an API key (ELEVENLABS_API_KEY).");

    if (NATIVE_PCM_RATES.has(this.sampleRate)) {
      this.outputFormat = `pcm_${this.sampleRate}`;
      this.srcRate = this.sampleRate;
    } else {
      this.outputFormat = "pcm_22050";
      this.srcRate = 22_050;
    }
    this.id = `elevenlabs:${this.model}:${this.voiceId}:${this.sampleRate}`;
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<SynthesizedSpeech> {
    const t = normalizeTtsText(text);
    if (t === "") {
      const pcm = silencePcm(0.3, this.sampleRate);
      return { pcm, sampleRate: this.sampleRate, durationSec: pcm.length / this.sampleRate };
    }

    const voiceId = opts?.voice ?? this.voiceId;

    if (t.length > MAX_CHARS) {
      const chunks = chunkText(t, MAX_CHARS);
      const parts: Int16Array[] = [];
      let durationSec = 0;
      for (const chunk of chunks) {
        const speech = await this.synthesizeOne(chunk, voiceId);
        parts.push(speech.pcm);
        durationSec += speech.durationSec;
      }
      const pcm = concatInt16(parts);
      return { pcm, sampleRate: this.sampleRate, durationSec };
    }

    return this.synthesizeOne(t, voiceId);
  }

  /** One ElevenLabs request for already-normalized text → engine-rate PCM. */
  private async synthesizeOne(text: string, voiceId: string): Promise<SynthesizedSpeech> {
    const url = `${this.baseUrl}/text-to-speech/${voiceId}?output_format=${this.outputFormat}`;
    const res = await withRetry((): Promise<Response> => this.request(url, text), isRetryable, {
      baseDelayMs: this.retryDelayMs,
    });

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 2) throw new Error("ElevenLabs returned an empty audio body.");
    const raw = pcmBytesToInt16(bytes);
    const pcm = resamplePcm(raw, this.srcRate, this.sampleRate);
    return { pcm, sampleRate: this.sampleRate, durationSec: pcm.length / this.sampleRate };
  }

  /** Perform the HTTP POST, throwing a tagged (retryable?) error for non-2xx / network / timeout. */
  private async request(url: string, text: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "content-type": "application/json",
          accept: "audio/pcm",
        },
        body: JSON.stringify({ text, model_id: this.model }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error).name;
      // Network failures and timeouts are transient → retryable.
      if (name === "TimeoutError" || name === "AbortError") {
        throw new ElevenLabsRequestError(`ElevenLabs request timed out after ${this.timeoutMs}ms`, true);
      }
      throw new ElevenLabsRequestError(`ElevenLabs request failed: ${(err as Error).message}`, true);
    }

    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        detail = "";
      }
      throw new ElevenLabsRequestError(`ElevenLabs request failed (${res.status})${detail ? `: ${detail}` : ""}`, retryable, res.status);
    }
    return res;
  }
}
