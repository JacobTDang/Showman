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
import { SAMPLE_RATE, pcmToWav, silencePcm, tonePcm, mixInto } from "./wav.js";

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
): Promise<{ wav: Buffer; segmentDurations: number[] }> {
  const total = new Int16Array(Math.max(1, Math.round(sceneDuration * sampleRate)));
  const segments = [...(narration.segments ?? [])].sort((a, b) => a.t - b.t);
  const segmentDurations: number[] = [];
  for (const seg of segments) {
    const speech = await provider.synthesize(seg.text, narration.voice ? { voice: narration.voice } : undefined);
    mixInto(total, speech.pcm, Math.round(seg.t * sampleRate));
    segmentDurations.push(speech.durationSec);
  }
  return { wav: pcmToWav(total, sampleRate), segmentDurations };
}
