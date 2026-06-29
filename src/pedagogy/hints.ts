/**
 * Contingent hint ladder — a sequence of hints that escalate (a nudge, then a strategy, then the
 * near-answer, then the answer), revealed one at a time on successive wrong attempts. Pure logic so a
 * tutor reveals exactly the right rung without over-helping. A themeable hint card lives in hintCard.ts.
 */

export interface Hint {
  /** Escalation rung — lower reveals first. */
  level: number;
  text: string;
}

export type HintLadder = Hint[];

function sortedRungs(ladder: HintLadder): Hint[] {
  return [...ladder].sort((a, b) => a.level - b.level);
}

/** The single hint to show after `wrongAttempts` wrong tries (1-based); null before any / once exhausted. */
export function nextHint(ladder: HintLadder, wrongAttempts: number): Hint | null {
  if (wrongAttempts < 1) return null;
  return sortedRungs(ladder)[wrongAttempts - 1] ?? null;
}

/** All hints revealed so far after `wrongAttempts` wrong tries (the ladder shown cumulatively). */
export function revealedHints(ladder: HintLadder, wrongAttempts: number): Hint[] {
  return sortedRungs(ladder).slice(0, Math.max(0, wrongAttempts));
}

/** Whether every rung has been shown (the learner has reached the answer-level hint). */
export function hintsExhausted(ladder: HintLadder, wrongAttempts: number): boolean {
  return wrongAttempts >= ladder.length;
}
