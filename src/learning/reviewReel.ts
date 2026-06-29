/**
 * Review-reel assembler — builds a personalized warm-up from a pool of past items, picking
 * the skills that are due-for-review or weak and INTERLEAVING them (round-robin across skills)
 * rather than blocking by topic. Interleaved practice is the higher-evidence schedule
 * (large delayed-test gains). Deterministic: `now` is passed in.
 */

import type { InteractionCue } from "../interaction/types.js";
import { dueKcs, weakKcs, masteryOf, type LearnerModel } from "./model.js";

export interface ReviewReelOptions {
  /** Max items in the reel. Default 10. */
  max?: number;
  /** Mastery threshold for "still due". Default 0.95. */
  threshold?: number;
}

/** Assemble an interleaved review reel of cues whose KC is due or weak, weakest skills first. */
export function buildReviewReel(model: LearnerModel, pool: InteractionCue[], now: number, opts: ReviewReelOptions = {}): InteractionCue[] {
  const max = opts.max ?? 10;
  const target = new Set([...dueKcs(model, now, opts.threshold ?? 0.95), ...weakKcs(model)]);

  // Group eligible cues by KC (preserving pool order within a skill).
  const byKc = new Map<string, InteractionCue[]>();
  for (const cue of pool) {
    if (cue.kc && target.has(cue.kc)) {
      const arr = byKc.get(cue.kc);
      if (arr) arr.push(cue);
      else byKc.set(cue.kc, [cue]);
    }
  }

  // Visit skills weakest-first, round-robin one cue at a time → interleaving across skills.
  const kcs = [...byKc.keys()].sort((a, b) => masteryOf(model, a) - masteryOf(model, b));
  const out: InteractionCue[] = [];
  let progressed = true;
  while (out.length < max && progressed) {
    progressed = false;
    for (const kc of kcs) {
      const cue = byKc.get(kc)!.shift();
      if (cue) {
        out.push(cue);
        progressed = true;
        if (out.length >= max) break;
      }
    }
  }
  return out;
}
