/**
 * Loudness helpers for consistent, non-distorted narration. Pure (no IO/randomness)
 * Int16 PCM transforms: measure the peak, normalize quiet clips up to a safe ceiling,
 * and gently limit overlapping mixed clips so they don't hard-clip. 16-bit full scale
 * is 32767; outputs stay within ±32767 (≈ -1 dBFS of true full scale at the limiter).
 */

/** Clamp to the symmetric 16-bit range so output never exceeds ±32767. */
function clampSample(v: number): number {
  if (v > 32767) return 32767;
  if (v < -32767) return -32767;
  return v | 0;
}

/** Peak amplitude as the max |sample| / 32767, in [0, 1] (0 for an empty/silent buffer). */
export function peakAmplitude(pcm: Int16Array): number {
  let maxAbs = 0;
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i]!);
    if (a > maxAbs) maxAbs = a;
  }
  return Math.min(1, maxAbs / 32767);
}

/**
 * Scale so the loudest sample reaches targetPeak*32767 (≈ -1 dBFS at 0.89). Returns the
 * input unchanged when silent (peak 0) or already at/above target — never amplifies noise
 * into clipping and never divides by zero. Otherwise returns a NEW rounded+clamped array.
 */
export function normalizePcm(pcm: Int16Array, targetPeak = 0.89): Int16Array {
  const peak = peakAmplitude(pcm);
  if (peak === 0 || peak >= targetPeak) return pcm;
  const gain = targetPeak / peak;
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = clampSample(Math.round(pcm[i]! * gain));
  return out;
}

/**
 * Gentle limiter for overlapping mixed clips: samples with |s| <= threshold*32767 pass
 * through unchanged; beyond the threshold they compress smoothly toward ±32767 via tanh,
 * preserving sign. Monotonic in magnitude and never exceeds ±32767. Returns a NEW array.
 */
export function softLimit(pcm: Int16Array, threshold = 0.92): Int16Array {
  const knee = 1 - threshold;
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i]!;
    const x = Math.abs(s) / 32767;
    if (x <= threshold || knee <= 0) {
      out[i] = clampSample(s);
      continue;
    }
    const y = threshold + knee * Math.tanh((x - threshold) / knee);
    out[i] = clampSample(Math.sign(s) * Math.round(y * 32767));
  }
  return out;
}
