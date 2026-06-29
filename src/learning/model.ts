/**
 * Learner model — per-skill mastery state, the input that drives adaptivity (branching,
 * review scheduling, dashboards). It maps each knowledge component (a skill / objective id,
 * e.g. a CCSS code) to its BKT mastery probability and its spaced-repetition card. Pure,
 * immutable updates; client-side and JSON-serializable so it can persist or sync.
 */

import { bktUpdate, isMastered, DEFAULT_BKT, type BktParams } from "./bkt.js";
import { newCard, scheduleReview, qualityFromAnswer, type ReviewCard } from "./scheduler.js";

export interface KcState {
  /** P(known) from BKT. */
  pKnown: number;
  attempts: number;
  correct: number;
  card: ReviewCard;
}

export interface LearnerModel {
  kcs: Record<string, KcState>;
}

export interface UpdateOptions {
  bkt?: BktParams;
  /** Answer latency hint for the scheduler (a fast correct answer → higher quality). */
  fast?: boolean;
}

export function emptyModel(): LearnerModel {
  return { kcs: {} };
}

/** Own-property KC lookup — ignores inherited members, so a KC id like "toString"/"__proto__" is safe. */
function ownKc(model: LearnerModel, kc: string): KcState | undefined {
  return Object.prototype.hasOwnProperty.call(model.kcs, kc) ? model.kcs[kc] : undefined;
}

/** Record one graded attempt at a knowledge component, returning a new model (immutable). */
export function applyResult(model: LearnerModel, kc: string, correct: boolean, now: number, opts: UpdateOptions = {}): LearnerModel {
  const params = opts.bkt ?? DEFAULT_BKT;
  const prev = ownKc(model, kc) ?? { pKnown: params.pInit, attempts: 0, correct: 0, card: newCard(now) };
  const next: KcState = {
    pKnown: bktUpdate(prev.pKnown, correct, params),
    attempts: prev.attempts + 1,
    correct: prev.correct + (correct ? 1 : 0),
    card: scheduleReview(prev.card, qualityFromAnswer(correct, { fast: opts.fast }), now),
  };
  return { kcs: { ...model.kcs, [kc]: next } };
}

/** P(known) for a skill (0 if unseen). */
export function masteryOf(model: LearnerModel, kc: string): number {
  return ownKc(model, kc)?.pKnown ?? 0;
}

/** Whether a skill is mastered. */
export function isKcMastered(model: LearnerModel, kc: string, threshold = 0.95): boolean {
  return isMastered(masteryOf(model, kc), threshold);
}

/** Skills due for review at `now` and not yet mastered — the spaced-retrieval pool. */
export function dueKcs(model: LearnerModel, now: number, threshold = 0.95): string[] {
  return Object.keys(model.kcs).filter((kc) => {
    const s = model.kcs[kc]!;
    return s.card.dueAt <= now && !isMastered(s.pKnown, threshold);
  });
}

/** Seen-but-weak skills (below `threshold` mastery), worst first. */
export function weakKcs(model: LearnerModel, threshold = 0.6): string[] {
  return Object.keys(model.kcs)
    .filter((kc) => model.kcs[kc]!.attempts > 0 && model.kcs[kc]!.pKnown < threshold)
    .sort((a, b) => model.kcs[a]!.pKnown - model.kcs[b]!.pKnown);
}

export function serializeModel(model: LearnerModel): string {
  return JSON.stringify(model);
}

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A persisted entry is only trusted if it is a complete, finite-valued KcState + ReviewCard. */
function isValidKc(s: unknown): s is KcState {
  if (!s || typeof s !== "object") return false;
  const k = s as { pKnown?: unknown; attempts?: unknown; correct?: unknown; card?: Record<string, unknown> };
  const c = k.card;
  return (
    isFiniteNum(k.pKnown) &&
    isFiniteNum(k.attempts) &&
    isFiniteNum(k.correct) &&
    !!c &&
    typeof c === "object" &&
    isFiniteNum(c.ease) &&
    isFiniteNum(c.intervalDays) &&
    isFiniteNum(c.reps) &&
    isFiniteNum(c.dueAt)
  );
}

/**
 * Parse a persisted model, dropping any malformed/partial entry (schema drift, corrupted
 * localStorage). Returns an empty model on non-JSON or non-object input, so consumers never
 * crash on a bad blob. `Object.fromEntries` is used so a `"__proto__"` key can't pollute.
 */
export function deserializeModel(json: string): LearnerModel {
  try {
    const v = JSON.parse(json) as { kcs?: Record<string, unknown> };
    if (!v || typeof v !== "object" || !v.kcs || typeof v.kcs !== "object") return emptyModel();
    return { kcs: Object.fromEntries(Object.entries(v.kcs).filter(([, s]) => isValidKc(s))) as Record<string, KcState> };
  } catch {
    return emptyModel();
  }
}
