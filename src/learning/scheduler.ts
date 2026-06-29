/**
 * Spaced-repetition scheduler (SM-2) — decides when a skill is next due for review. Spacing
 * and interleaving are among the most replicated effects in learning science; this turns
 * "answered a question" into "see it again at the right time". Pure + deterministic: the
 * current time is passed in (never read from the clock), so schedules are reproducible.
 */

const DAY_MS = 86_400_000;

export interface ReviewCard {
  /** SM-2 ease factor (≥ 1.3); higher = longer intervals. */
  ease: number;
  /** Current interval in days. */
  intervalDays: number;
  /** Consecutive successful reviews. */
  reps: number;
  /** Epoch-ms timestamp when the card is next due. */
  dueAt: number;
}

/** A fresh card, due immediately (at `now`). */
export function newCard(now: number): ReviewCard {
  return { ease: 2.5, intervalDays: 0, reps: 0, dueAt: now };
}

/**
 * Advance a card after a review of `quality` (0–5; SM-2 convention, ≥ 3 is a pass). Returns a
 * new card (immutable). A lapse (quality < 3) resets the interval; a pass grows it by the ease.
 */
export function scheduleReview(card: ReviewCard, quality: number, now: number): ReviewCard {
  const q = Math.max(0, Math.min(5, quality));
  let { ease, intervalDays, reps } = card;
  if (q < 3) {
    reps = 0;
    intervalDays = 1; // relearn tomorrow
  } else {
    reps += 1;
    intervalDays = reps === 1 ? 1 : reps === 2 ? 6 : Math.max(1, Math.round(intervalDays * ease));
    ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  }
  return { ease, intervalDays, reps, dueAt: now + intervalDays * DAY_MS };
}

/** Map a graded answer (+ optional response latency) to an SM-2 quality 0–5. */
export function qualityFromAnswer(correct: boolean, opts: { fast?: boolean } = {}): number {
  if (!correct) return 1;
  return opts.fast ? 5 : 4;
}
