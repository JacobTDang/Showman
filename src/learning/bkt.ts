/**
 * Bayesian Knowledge Tracing — the standard, interpretable model of a learner's mastery
 * of a single skill (knowledge component). After each graded attempt it updates P(known),
 * the probability the learner has learned the skill. Pure + deterministic.
 *
 * Four parameters: prior P(L0), learn-rate P(T), slip P(S) (knows it but slips), and guess
 * P(G) (doesn't know it but guesses right). Defaults are the commonly-cited starting values.
 */

export interface BktParams {
  /** Prior P(known) before any evidence. */
  pInit: number;
  /** P(transit) — chance an unknown skill becomes known after an attempt. */
  pTransit: number;
  /** P(slip) — chance of answering wrong despite knowing. */
  pSlip: number;
  /** P(guess) — chance of answering right without knowing. */
  pGuess: number;
}

export const DEFAULT_BKT: BktParams = { pInit: 0.25, pTransit: 0.15, pSlip: 0.1, pGuess: 0.2 };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Update P(known) from one observation (correct/incorrect): Bayesian posterior given the
 * evidence, then the learning transit (the attempt itself may teach the skill).
 */
export function bktUpdate(pKnown: number, correct: boolean, params: BktParams = DEFAULT_BKT): number {
  const prior = clamp01(Number.isFinite(pKnown) ? pKnown : params.pInit);
  const likeKnown = correct ? 1 - params.pSlip : params.pSlip;
  const likeNot = correct ? params.pGuess : 1 - params.pGuess;
  const denom = prior * likeKnown + (1 - prior) * likeNot;
  const posterior = denom > 0 ? (prior * likeKnown) / denom : prior;
  return clamp01(posterior + (1 - posterior) * params.pTransit);
}

/** Whether a skill counts as mastered (P(known) at or above the threshold). */
export function isMastered(pKnown: number, threshold = 0.95): boolean {
  return pKnown >= threshold;
}
