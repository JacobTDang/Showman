/**
 * Interaction runtime — the pure logic behind the player: grading a response and finding
 * which cues fall due in a time window. No DOM, no video — just functions, so it is fully
 * unit-tested and shared verbatim by the HTML player.
 */

import type { InteractionCue, InteractionTrack, Response } from "./types.js";

export interface GradeResult {
  /** True when the response is correct. Always false for an ungraded `pausePrompt`. */
  correct: boolean;
  /** Targeted feedback (per-choice / explanation) to show after answering. */
  feedback?: string;
  /** Whether this cue type is graded at all (false for `pausePrompt`). */
  graded: boolean;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Grade a learner's response to a cue. Pure. */
export function gradeCue(cue: InteractionCue, response: Response): GradeResult {
  switch (cue.kind) {
    case "mcq": {
      const i = typeof response === "number" ? response : -1;
      const correct = i === cue.answer;
      const perChoice = !correct && cue.feedback && i >= 0 && i < cue.feedback.length ? cue.feedback[i] : undefined;
      // `||` (not `??`) so a blank per-choice entry falls back to the general explanation.
      return { correct, graded: true, feedback: perChoice || cue.explanation };
    }
    case "trueFalse":
      return { correct: response === cue.answer, graded: true, feedback: cue.explanation };
    case "numeric": {
      const v = typeof response === "number" ? response : NaN;
      const correct = Number.isFinite(v) && Math.abs(v - cue.answer) <= (cue.tolerance ?? 0);
      return { correct, graded: true, feedback: cue.explanation };
    }
    case "freeResponse": {
      const s = typeof response === "string" ? norm(response) : "";
      return { correct: cue.accept.some((a) => norm(a) === s), graded: true, feedback: cue.explanation };
    }
    case "hotspot": {
      const i = typeof response === "number" ? response : -1;
      const region = i >= 0 && i < cue.regions.length ? cue.regions[i] : undefined;
      return { correct: region?.correct === true, graded: true, feedback: cue.explanation };
    }
    case "pausePrompt":
      return { correct: false, graded: false };
  }
}

/** Which region (if any) a click at (x, y) hits — the highest-index match wins (last drawn on top). */
export function hitRegion(cue: { regions: { x: number; y: number; w: number; h: number }[] }, x: number, y: number): number {
  for (let i = cue.regions.length - 1; i >= 0; i--) {
    const r = cue.regions[i]!;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

/** Cues sorted by time, then id (stable, deterministic ordering). */
export function sortedCues(track: InteractionTrack): InteractionCue[] {
  return [...track.cues].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

/** Cues due in the half-open window (fromT, toT] — the ones to fire as playback advances. */
export function dueCues(track: InteractionTrack, fromT: number, toT: number): InteractionCue[] {
  return sortedCues(track).filter((c) => c.t > fromT && c.t <= toT);
}

/** Whether a cue pauses playback (default true). */
export function pauses(cue: InteractionCue): boolean {
  return cue.pause !== false;
}
