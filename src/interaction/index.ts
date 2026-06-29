/**
 * Interaction platform — turn a pre-rendered lesson into an interactive one via a sidecar
 * (`interactions.json`) + a thin player. The deterministic renderer never sees interactions,
 * so frames stay byte-identical; cues anchor to narration-beat timestamps.
 */

export * from "./types.js";
export * from "./builders.js";
export * from "./validate.js";
export * from "./runtime.js";

import type { InteractionTrack } from "./types.js";

/** Serialize a track to the `interactions.json` sidecar payload. */
export function toInteractionsJson(track: InteractionTrack): string {
  return JSON.stringify(track);
}
