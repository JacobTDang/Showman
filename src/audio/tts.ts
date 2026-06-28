/**
 * M5.4 — Text-to-speech + narration assembly.
 *
 * A pluggable TtsProvider turns a line into PCM. The narration track's segment
 * times drive *where* each line sits on the timeline (synced to the same fps clock
 * as the animation), and the result is one audio track the length of the scene —
 * ready to mux. The offline providers (silent / tone) make the whole pipeline
 * deterministic and testable; a cloud provider decodes its output to PCM the same
 * way and drops in behind this interface.
 */

import type { NarrationTrack } from "../spec/types.js";
import { SAMPLE_RATE, pcmToWav, silencePcm, tonePcm } from "./wav.js";
import { mapLimit } from "./concurrency.js";
import { normalizePcm, softLimitMix } from "./loudness.js";

export interface SynthesizedSpeech {
  pcm: Int16Array;
  sampleRate: number;
  durationSec: number;
}

export interface TtsProvider {
  synthesize(text: string, opts?: { voice?: string }): Promise<SynthesizedSpeech>;
}

/** Child-paced estimate of how long a line takes to speak. */
export function estimateSpeechDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.6, words / 2.3); // ~2.3 words/sec
}

/** Silent provider: correct durations, no sound. Deterministic; the pipeline default. */
export class SilentTtsProvider implements TtsProvider {
  constructor(private readonly sampleRate = SAMPLE_RATE) {}
  async synthesize(text: string): Promise<SynthesizedSpeech> {
    const durationSec = estimateSpeechDuration(text);
    return { pcm: silencePcm(durationSec, this.sampleRate), sampleRate: this.sampleRate, durationSec };
  }
}

/** Tone provider: an audible placeholder (pitch varies by line) for demos/tests. */
export class ToneTtsProvider implements TtsProvider {
  constructor(private readonly sampleRate = SAMPLE_RATE) {}
  async synthesize(text: string): Promise<SynthesizedSpeech> {
    const durationSec = estimateSpeechDuration(text);
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    const freq = 220 + (h % 12) * 40; // A3..~ over a small scale
    return { pcm: tonePcm(durationSec, freq, this.sampleRate), sampleRate: this.sampleRate, durationSec };
  }
}

/**
 * Synthesize a full narration track to one WAV the length of `sceneDuration`, with
 * each segment placed at its start time. Returns the WAV bytes and the per-segment
 * resolved durations (useful for caption end-times).
 */
export async function synthesizeNarration(
  provider: TtsProvider,
  narration: NarrationTrack,
  sceneDuration: number,
  sampleRate = SAMPLE_RATE,
  opts: { concurrency?: number; normalize?: boolean } = {},
): Promise<{ wav: Buffer; segmentDurations: number[] }> {
  const len = Math.max(1, Math.round(sceneDuration * sampleRate));
  // Accumulate in float (no per-add clamp) so overlapping clips are summed faithfully and
  // the limiter below can actually compress them — a fixed Int16 buffer would hard-clip on
  // each add before the limiter ever sees the sum.
  const acc = new Float64Array(len);
  const segments = [...(narration.segments ?? [])].sort((a, b) => a.t - b.t);
  const normalize = opts.normalize ?? true;
  // Synthesize segments (optionally in parallel). Placement is by start time, so the
  // result is byte-identical regardless of concurrency — order just affects speed.
  const clips = await mapLimit(segments, Math.max(1, opts.concurrency ?? 1), (seg) =>
    provider.synthesize(seg.text, narration.voice ? { voice: narration.voice } : undefined),
  );
  const segmentDurations: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    const speech = clips[i]!;
    // Per-clip peak normalization keeps every line at a consistent, comfortable level.
    const pcm = normalize ? normalizePcm(speech.pcm) : speech.pcm;
    const offset = Math.round(segments[i]!.t * sampleRate);
    for (let j = 0; j < pcm.length; j++) {
      const k = offset + j;
      if (k >= 0 && k < len) acc[k]! += pcm[j]!;
    }
    segmentDurations.push(speech.durationSec);
  }
  // Soft-limit the summed track down to Int16 so overlaps compress instead of distorting.
  return { wav: pcmToWav(softLimitMix(acc), sampleRate), segmentDurations };
}

/** Total characters across all narration segments — a per-render cost/abuse guard input. */
export function narrationCharCount(narration: NarrationTrack): number {
  return (narration.segments ?? []).reduce((n, s) => n + (s.text?.length ?? 0), 0);
}

/**
 * Measure real per-segment speech durations and the total duration the scene needs so
 * the last clip isn't truncated by `mixInto`'s fixed-length buffer. Synthesizes via the
 * provider (wrap it in a CachingTtsProvider so the later `synthesizeNarration` reuses
 * these clips for free). Durations are returned in ascending-`t` segment order.
 */
export async function measureNarration(
  provider: TtsProvider,
  narration: NarrationTrack,
): Promise<{ segmentDurations: number[]; requiredDuration: number }> {
  const segments = [...(narration.segments ?? [])].sort((a, b) => a.t - b.t);
  const segmentDurations: number[] = [];
  let requiredDuration = 0;
  for (const seg of segments) {
    const speech = await provider.synthesize(seg.text, narration.voice ? { voice: narration.voice } : undefined);
    segmentDurations.push(speech.durationSec);
    // Ignore a non-finite/negative start time so a pathological segment can't blow up the
    // required duration (RenderService re-checks the fitted duration against the frame limits).
    const start = Number.isFinite(seg.t) && seg.t > 0 ? seg.t : 0;
    requiredDuration = Math.max(requiredDuration, start + speech.durationSec);
  }
  return { segmentDurations, requiredDuration };
}

/** A scene duration that fits the narration audio (never shrinks the scene), with a small tail pad. */
export function fitSceneDuration(currentDuration: number, requiredDuration: number, padSec = 0.4): number {
  return Math.max(currentDuration, requiredDuration + padSec);
}
