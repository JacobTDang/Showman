/**
 * Kokoro — a free, local, high-quality neural TTS (82M params, Apache-2.0) that runs
 * in Node via the optional `kokoro-js` package (ONNX, no Python, no API, no key). The
 * package + model weights are heavy, so it is a LAZY, OPTIONAL dependency: the engine
 * doesn't require it; install it (`npm install kokoro-js`) and select it with
 * `SHOWMAN_TTS_PROVIDER=kokoro`. Output is 24 kHz Float32 → converted + resampled to
 * the engine's 22050 Hz PCM. Wrap in a CachingTtsProvider — generation is the slow
 * part, so the disk cache is especially valuable here.
 *
 * GPU: it tries hardware acceleration first and falls back to CPU. The default order
 * is CUDA → WebGPU → CPU (good for an NVIDIA card); override with `KOKORO_DEVICE`
 * (e.g. `cuda`, `webgpu`, or `cpu`). The device that loaded is printed to stderr so
 * you can confirm the GPU is being used. CUDA needs a CUDA-enabled onnxruntime
 * (CUDA 12 + cuDNN); WebGPU needs a WebGPU-capable runtime.
 */

import type { TtsProvider, SynthesizedSpeech } from "../tts.js";
import { SAMPLE_RATE, silencePcm } from "../wav.js";
import { float32ToInt16, resamplePcm, normalizeTtsText } from "../ttsUtil.js";

/** The bits of the `kokoro-js` API we use (kept minimal so the dep can be absent at build time). */
interface KokoroAudio {
  audio: Float32Array;
  sampling_rate: number;
}
export interface KokoroEngine {
  generate(text: string, opts: { voice?: string }): Promise<KokoroAudio>;
}
export interface KokoroModule {
  KokoroTTS: { from_pretrained(model: string, opts: { dtype?: string; device?: string }): Promise<KokoroEngine> };
}

const KOKORO_MODULE = "kokoro-js";

async function defaultLoad(): Promise<KokoroModule> {
  const imported: unknown = await import(KOKORO_MODULE);
  return imported as KokoroModule;
}

function uniq(values: string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) === i);
}

export interface KokoroTtsOptions {
  /** Hugging Face ONNX repo. Default "onnx-community/Kokoro-82M-v1.0-ONNX". */
  model?: string;
  /** Kokoro voice id, e.g. af_heart (warm female), am_michael, bf_emma. Default "af_heart". */
  voice?: string;
  /** Weight precision: q8 (default, ~86MB, fast) … fp32 (best quality, ~326MB). GPU likes fp16/q4f16. */
  dtype?: string;
  /** Force a single onnxruntime device (cpu | cuda | webgpu). Default: try GPU then CPU. */
  device?: string;
  sampleRate?: number;
  /** Inject the module loader for tests (avoids the real package + model download). */
  load?: () => Promise<KokoroModule>;
  /** Sink for the "loaded on device X" notice (defaults to stderr). */
  log?: (msg: string) => void;
}

export class KokoroTtsProvider implements TtsProvider {
  private readonly model: string;
  private readonly voice: string;
  private readonly dtype: string;
  private readonly devices: string[];
  private readonly sampleRate: number;
  private readonly load: () => Promise<KokoroModule>;
  private readonly log: (msg: string) => void;
  private enginePromise: Promise<KokoroEngine> | undefined;
  private readonly badVoices = new Set<string>();
  readonly id: string;

  constructor(opts: KokoroTtsOptions = {}) {
    this.model = opts.model ?? process.env.KOKORO_MODEL ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
    this.voice = opts.voice ?? process.env.SHOWMAN_TTS_VOICE ?? "af_heart";
    this.dtype = opts.dtype ?? process.env.KOKORO_DTYPE ?? "q8";
    this.sampleRate = opts.sampleRate ?? SAMPLE_RATE;
    // GPU-first, with a CPU fallback always last so it still runs without a GPU.
    const forced = opts.device ?? process.env.KOKORO_DEVICE;
    this.devices = uniq(forced ? [forced, "cpu"] : ["cuda", "webgpu", "cpu"]);
    this.load = opts.load ?? defaultLoad;
    this.log = opts.log ?? ((msg) => process.stderr.write(msg + "\n"));
    // The device does NOT affect the audio, so it stays out of the cache id.
    this.id = `kokoro:${this.model}:${this.voice}:${this.sampleRate}`;
  }

  /** Load the package + model once (memoized), trying each device in order. */
  private engine(): Promise<KokoroEngine> {
    if (!this.enginePromise) {
      const p = (async () => {
        let mod: KokoroModule;
        try {
          mod = await this.load();
        } catch (err) {
          throw new Error(
            `KokoroTtsProvider needs the optional "kokoro-js" package — run \`npm install kokoro-js\`. (${(err as Error).message})`,
          );
        }
        let lastErr: unknown;
        for (let i = 0; i < this.devices.length; i++) {
          const device = this.devices[i]!;
          try {
            const engine = await mod.KokoroTTS.from_pretrained(this.model, { dtype: this.dtype, device });
            this.log(`[kokoro] loaded ${this.model} (${this.dtype}) on device: ${device}`);
            return engine;
          } catch (err) {
            lastErr = err;
            if (i < this.devices.length - 1) this.log(`[kokoro] device "${device}" unavailable, trying "${this.devices[i + 1]!}" …`);
          }
        }
        throw new Error(
          `KokoroTtsProvider could not load on any device [${this.devices.join(", ")}]: ${(lastErr as Error)?.message ?? lastErr}`,
        );
      })();
      // Don't permanently memoize a rejected load — a transient failure should be retryable.
      p.catch(() => {
        if (this.enginePromise === p) this.enginePromise = undefined;
      });
      this.enginePromise = p;
    }
    return this.enginePromise;
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<SynthesizedSpeech> {
    const t = normalizeTtsText(text);
    if (t === "") {
      return { pcm: silencePcm(0.3, this.sampleRate), sampleRate: this.sampleRate, durationSec: 0.3 };
    }
    const engine = await this.engine();
    const requested = opts?.voice ?? this.voice;
    // A narration `voice` is a hint; if Kokoro doesn't know it, fall back to the
    // configured default rather than failing the whole render.
    const voice = this.badVoices.has(requested) ? this.voice : requested;
    let out: { audio: Float32Array; sampling_rate: number };
    try {
      out = await engine.generate(t, { voice });
    } catch (err) {
      // Only treat a genuinely voice-related error as an unknown voice; rethrow anything
      // else (a transient/model error must not permanently downgrade a valid voice).
      const voiceError = /voice|not found|unknown/i.test((err as Error)?.message ?? "");
      if (voice === this.voice || !voiceError) throw err;
      this.badVoices.add(voice);
      this.log(`[kokoro] voice "${voice}" not available, using "${this.voice}"`);
      out = await engine.generate(t, { voice: this.voice });
    }
    const pcm = resamplePcm(float32ToInt16(out.audio), out.sampling_rate, this.sampleRate);
    return { pcm, sampleRate: this.sampleRate, durationSec: pcm.length / this.sampleRate };
  }
}
