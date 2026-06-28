/**
 * M5.4 — Caching decorator for TtsProvider.
 *
 * Cloud TTS is non-deterministic and billed per call. Wrapping any provider in this
 * decorator makes repeat renders reproducible (same input -> same PCM), free (a cache
 * hit never calls the inner provider), and idempotent across retries (a miss writes the
 * cache atomically, so a crash or concurrent run can't leave a half-written file behind).
 *
 * The cache key is the sha256 of `${innerId}<NUL>${normalizedText}<NUL>${voice}` — the
 * NUL byte is an unambiguous field separator because normalizeTtsText strips all control
 * chars, so it can never appear inside a field. The key is invalidated automatically when
 * the provider/model/voice/rate (encoded in the inner id) or the spoken text changes.
 * Each entry is two files: `<key>.pcm` (raw little-endian int16 samples) and `<key>.json`
 * ({ sampleRate, durationSec }).
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { TtsProvider, SynthesizedSpeech } from "./tts.js";
import { normalizeTtsText, pcmBytesToInt16, int16ToBytes } from "./ttsUtil.js";

/** NUL (U+0000) field separator for cache keys — stripped from text by normalizeTtsText. */
const SEP = String.fromCharCode(0);

export interface CachingTtsOptions {
  /** Cache directory. Defaults to $SHOWMAN_TTS_CACHE then "data/tts-cache". */
  dir?: string;
}

/** Wraps any TtsProvider with a content-addressed on-disk PCM cache. */
export class CachingTtsProvider implements TtsProvider {
  private readonly cacheDir: string;

  constructor(
    private readonly inner: TtsProvider,
    opts: CachingTtsOptions = {},
  ) {
    this.cacheDir = opts.dir ?? process.env.SHOWMAN_TTS_CACHE ?? "data/tts-cache";
  }

  /** Stable id used in cache keys; the inner provider's id when it exposes one. */
  get id(): string {
    return (this.inner as { id?: string }).id ?? "tts";
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<SynthesizedSpeech> {
    const key = createHash("sha256")
      .update(`${this.id}${SEP}${normalizeTtsText(text)}${SEP}${opts?.voice ?? ""}`)
      .digest("hex");
    const pcmPath = join(this.cacheDir, key + ".pcm");
    const metaPath = join(this.cacheDir, key + ".json");

    const hit = this.tryRead(pcmPath, metaPath);
    if (hit) return hit;

    const speech = await this.inner.synthesize(text, opts);
    mkdirSync(this.cacheDir, { recursive: true });
    this.atomicWrite(pcmPath, int16ToBytes(speech.pcm));
    this.atomicWrite(metaPath, JSON.stringify({ sampleRate: speech.sampleRate, durationSec: speech.durationSec }));
    return speech;
  }

  /** Read a cache entry, or undefined on any miss (missing / corrupt / parse / mismatch). */
  private tryRead(pcmPath: string, metaPath: string): SynthesizedSpeech | undefined {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { sampleRate?: unknown; durationSec?: unknown };
      const sampleRate = meta.sampleRate;
      const durationSec = meta.durationSec;
      if (
        typeof sampleRate !== "number" ||
        typeof durationSec !== "number" ||
        !Number.isFinite(sampleRate) ||
        !Number.isFinite(durationSec)
      ) {
        throw new Error("invalid cache metadata");
      }
      const pcm = pcmBytesToInt16(readFileSync(pcmPath));
      // Integrity check: the byte count must match the recorded duration. A truncated or
      // garbage .pcm fails here and falls through to a fresh synth (which heals the cache).
      if (pcm.length !== Math.round(durationSec * sampleRate)) {
        throw new Error("cache pcm length mismatch");
      }
      return { pcm, sampleRate, durationSec };
    } catch {
      return undefined;
    }
  }

  /** Write `data` durably: a crash leaves either the old file or the new one, never a partial. */
  private atomicWrite(path: string, data: Uint8Array | string): void {
    const tmp = path + ".tmp";
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  }
}
