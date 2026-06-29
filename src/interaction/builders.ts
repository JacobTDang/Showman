/**
 * Ergonomic constructors for interaction cues — set the `kind` discriminant and apply
 * defaults so authors (and AI agents) write `mcq({ t, prompt, choices, answer })` rather
 * than hand-building the discriminated union.
 */

import type {
  McqCue,
  TrueFalseCue,
  NumericCue,
  FreeResponseCue,
  HotspotCue,
  PausePromptCue,
  InteractionCue,
  InteractionTrack,
} from "./types.js";

export function mcq(o: Omit<McqCue, "kind">): McqCue {
  return { kind: "mcq", ...o };
}
export function trueFalse(o: Omit<TrueFalseCue, "kind">): TrueFalseCue {
  return { kind: "trueFalse", ...o };
}
export function numeric(o: Omit<NumericCue, "kind">): NumericCue {
  return { kind: "numeric", ...o };
}
export function freeResponse(o: Omit<FreeResponseCue, "kind">): FreeResponseCue {
  return { kind: "freeResponse", ...o };
}
export function hotspot(o: Omit<HotspotCue, "kind">): HotspotCue {
  return { kind: "hotspot", ...o };
}
export function pausePrompt(o: Omit<PausePromptCue, "kind">): PausePromptCue {
  return { kind: "pausePrompt", ...o };
}

/** Bundle cues into an interaction track. */
export function interactionTrack(...cues: InteractionCue[]): InteractionTrack {
  return { cues };
}
