/**
 * Minimal 16-bit PCM mono WAV utilities. Used to assemble narration on a timeline
 * deterministically without external tools (the offline TTS path), then mux into
 * the video. Real TTS providers return PCM the same way (decoding their output once).
 */

export const SAMPLE_RATE = 22_050;

/** Wrap mono Int16 PCM samples in a WAV container. */
export function pcmToWav(pcm: Int16Array, sampleRate = SAMPLE_RATE): Buffer {
  const byteRate = sampleRate * 2;
  const dataSize = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(clampSample(pcm[i]!), 44 + i * 2);
  return buf;
}

function clampSample(v: number): number {
  if (v > 32767) return 32767;
  if (v < -32768) return -32768;
  return v | 0;
}

/** Silence of `durationSec`. */
export function silencePcm(durationSec: number, sampleRate = SAMPLE_RATE): Int16Array {
  return new Int16Array(Math.max(0, Math.round(durationSec * sampleRate)));
}

/** A gentle sine tone — an audible stand-in for speech in demos/tests. */
export function tonePcm(durationSec: number, freq: number, sampleRate = SAMPLE_RATE, amplitude = 0.18): Int16Array {
  const n = Math.max(0, Math.round(durationSec * sampleRate));
  const out = new Int16Array(n);
  const fade = Math.min(n, Math.round(0.02 * sampleRate)); // 20ms in/out fade to avoid clicks
  for (let i = 0; i < n; i++) {
    let env = amplitude;
    if (i < fade) env *= i / fade;
    else if (i > n - fade) env *= (n - i) / fade;
    out[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * env * 32767);
  }
  return out;
}

/** Overlay `src` onto `dst` starting at sample offset, additive with clamping. In place. */
export function mixInto(dst: Int16Array, src: Int16Array, offsetSamples: number): void {
  for (let i = 0; i < src.length; i++) {
    const j = offsetSamples + i;
    if (j < 0 || j >= dst.length) continue;
    dst[j] = clampSample(dst[j]! + src[i]!);
  }
}
