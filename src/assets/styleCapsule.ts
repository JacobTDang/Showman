/**
 * Style Capsule — the concrete answer to "consistent art across a whole lesson". A capsule is a
 * frozen bundle of {style direction, seed, reference assets}; merging it into every illustration
 * request makes the set look art-directed by one hand, and (because the seed + style id are
 * hashed into the request) it's reproducible and cache-stable.
 */

import type { AssetRequest } from "./provider.js";

export interface StyleCapsule {
  id: string;
  /** Style direction appended to every prompt (e.g. "flat vector, soft pastel palette, friendly kids' book"). */
  style: string;
  /** Frozen seed so a lesson's art is reproducible and coherent across assets. */
  seed: number;
  /** Reference asset hashes (e.g. a character sheet) for cross-asset consistency. They scope the
   * asset cache key + provenance; only a provider with reference-image support forwards them to
   * the model (HttpImageGenerator does not — see its note). */
  refs?: string[];
}

/** Build an asset request for `prompt` under a style capsule (shared look + seed + references). */
export function applyCapsule(capsule: StyleCapsule, prompt: string, kind: AssetRequest["kind"] = "image"): AssetRequest {
  return {
    kind,
    prompt: `${prompt.trim()} — ${capsule.style}`,
    seed: capsule.seed,
    style: capsule.id,
    ...(capsule.refs && capsule.refs.length > 0 ? { refs: capsule.refs } : {}),
  };
}
