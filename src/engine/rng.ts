/**
 * Deterministic, seeded pseudo-random number generation.
 *
 * The render core is a pure function of (spec, frame, seed). That property is the
 * foundation every later guarantee stands on: parallel shard rendering, retry-on-
 * failure, and golden-frame regression all assume identical input -> identical
 * bytes. So the engine must NEVER touch `Math.random()`, `Date.now()`, or any
 * other ambient source of entropy. All randomness flows from here.
 */

/** A deterministic RNG, fully determined by its seed. */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Pick an element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Derive a fresh independent RNG from this one's stream and a label/index. */
  fork(label: number): Rng;
}

/**
 * mulberry32 — a small, fast, well-distributed 32-bit generator. Deterministic for
 * a given 32-bit seed and identical across platforms (pure integer math via
 * Math.imul and uint32 coercion).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mix integers into a 32-bit seed deterministically. Used to derive independent,
 * reproducible sub-seeds (e.g. per-node) from a scene seed.
 */
export function hashSeed(...values: number[]): number {
  let h = 0x811c9dc5; // FNV-1a offset basis
  for (const v of values) {
    // Fold the value's 32 bits in, byte by byte.
    let x = v | 0;
    for (let i = 0; i < 4; i++) {
      h ^= x & 0xff;
      h = Math.imul(h, 0x01000193);
      x >>>= 8;
    }
  }
  return h >>> 0;
}

/** Create a deterministic RNG from a seed. */
export function makeRng(seed: number): Rng {
  const gen = mulberry32(hashSeed(seed | 0));

  const rng: Rng = {
    next: () => gen(),
    float: (min, max) => min + gen() * (max - min),
    int: (min, max) => {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(gen() * (hi - lo + 1));
    },
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error("rng.pick: empty array");
      const idx = Math.floor(gen() * items.length);
      // idx is in [0, length) by construction; the assertion satisfies noUncheckedIndexedAccess.
      return items[idx]!;
    },
    fork: (label: number) => makeRng(hashSeed(seed | 0, label | 0)),
  };
  return rng;
}
