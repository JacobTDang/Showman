/**
 * Learning layer — a BKT learner model + spaced-repetition scheduler that consume interaction
 * results to drive adaptivity (mastery, review scheduling, the personalized warm-up reel).
 * Pure client-side logic; the deterministic renderer is untouched.
 */

export * from "./bkt.js";
export * from "./scheduler.js";
export * from "./model.js";
export * from "./reviewReel.js";

import type { InteractionCue } from "../interaction/types.js";
import type { GradeResult } from "../interaction/runtime.js";
import { applyResult, type LearnerModel, type UpdateOptions } from "./model.js";

/** Update the learner model from a graded cue. Ungraded cues, or cues with no `kc`, pass through unchanged. */
export function recordCueResult(
  model: LearnerModel,
  cue: InteractionCue,
  grade: GradeResult,
  now: number,
  opts?: UpdateOptions,
): LearnerModel {
  if (!cue.kc || !grade.graded) return model;
  return applyResult(model, cue.kc, grade.correct, now, opts);
}
