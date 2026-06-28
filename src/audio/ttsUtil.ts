/**
 * Shared utilities for cloud TTS providers — pure (network-free) helpers for turning
 * a provider's raw PCM response into the engine's `Int16Array` at SAMPLE_RATE, plus
 * text normalization, chunking, and a small retry/backoff helper. Kept separate from
 * the providers so they (and their unit tests) share one tested base.
 */

/** Decode raw little-endian 16-bit mono PCM bytes to an Int16Array (a trailing odd byte is dropped). */
export function pcmBytesToInt16(bytes: Uint8Array): Int16Array {
  const n = Math.floor(bytes.byteLength / 2);
  const out = new Int16Array(n);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true); // explicit little-endian (cross-platform)
  return out;
}

/** Encode an Int16Array to little-endian bytes (inverse of {@link pcmBytesToInt16}). */
export function int16ToBytes(pcm: Int16Array): Uint8Array {
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < pcm.length; i++) view.setInt16(i * 2, pcm[i]!, true);
  return bytes;
}

/** Linear-resample mono PCM from srcRate to dstRate. Identity (returns input) when rates match. */
export function resamplePcm(pcm: Int16Array, srcRate: number, dstRate: number): Int16Array {
  if (!Number.isFinite(srcRate) || !Number.isFinite(dstRate) || srcRate <= 0 || dstRate <= 0) return pcm;
  if (srcRate === dstRate || pcm.length === 0) return pcm;
  const ratio = srcRate / dstRate;
  const dstLen = Math.max(1, Math.round(pcm.length / ratio));
  const out = new Int16Array(dstLen);
  const last = pcm.length - 1;
  for (let i = 0; i < dstLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.min(Math.floor(srcPos), last);
    const i1 = Math.min(i0 + 1, last);
    const frac = srcPos - i0;
    out[i] = Math.round(pcm[i0]! * (1 - frac) + pcm[i1]! * frac);
  }
  return out;
}

// Strip ASCII control characters (this is the whole point of the normalizer, so the
// rule that bans control chars in regexes is intentionally disabled here).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

/** Normalize narration text for stable caching + clean synthesis: strip control chars, collapse whitespace, trim. */
export function normalizeTtsText(text: string): string {
  return text.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

/** Split text into chunks no longer than maxChars, preferring sentence then word boundaries. */
export function chunkText(text: string, maxChars = 4000): string[] {
  const t = normalizeTtsText(text);
  if (t.length === 0) return [];
  if (t.length <= maxChars) return [t];
  const chunks: string[] = [];
  let rest = t;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(". ", maxChars);
    if (cut < maxChars * 0.5) cut = rest.lastIndexOf(" ", maxChars);
    if (cut <= 0) cut = maxChars;
    chunks.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) chunks.push(rest.trim());
  return chunks;
}

export interface RetryOptions {
  /** Max retries after the first attempt. Default 3. */
  retries?: number;
  /** Base backoff in ms (doubles each attempt). Default 400. Set 0 in tests. */
  baseDelayMs?: number;
  /** Sleep impl (injectable for tests). */
  sleep?: (ms: number) => Promise<void>;
}

/** Run `fn` with exponential backoff, retrying only while `isRetryable(err)` and attempts remain. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  isRetryable: (err: unknown) => boolean,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 400;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) throw err;
      if (base > 0) await sleep(base * 2 ** attempt);
    }
  }
  throw lastErr;
}
