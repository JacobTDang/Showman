/**
 * Parametric item bank — deterministic question generators. A template samples parameters from a
 * seeded RNG, computes the correct answer, and offers *misconception* distractors (wrong answers that
 * each correspond to a specific, common student error), so a generated bank is diagnostic, not just
 * randomized. Same seed → same bank, on every platform. Pure.
 */

import type { Rng } from "../engine/rng.js";
import { makeRng } from "../engine/rng.js";

export type ItemParams = Record<string, number>;

/** A wrong answer tied to the misconception that produces it. */
export interface Distractor {
  value: number;
  /** The student error this option diagnoses (e.g. "added instead of multiplying"). */
  why: string;
}

export interface ItemTemplate {
  id: string;
  tags?: string[];
  /** Sample question parameters deterministically. */
  sample: (rng: Rng) => ItemParams;
  /** The question stem from the parameters. */
  stem: (p: ItemParams) => string;
  /** The correct numeric answer. */
  answer: (p: ItemParams) => number;
  /** Misconception distractors (deduped against the answer; up to 3 are used). */
  distractors: (p: ItemParams) => Distractor[];
}

export interface GeneratedItem {
  templateId: string;
  params: ItemParams;
  stem: string;
  /** Shuffled answer options (as display strings). */
  choices: string[];
  correctIndex: number;
  answer: number;
  /** Parallel to `choices`: "" for the correct option, else the misconception it diagnoses. */
  rationales: string[];
  tags: string[];
}

function shuffle<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

/** Generate one item from a template using the given RNG. */
export function generateItem(template: ItemTemplate, rng: Rng): GeneratedItem {
  const params = template.sample(rng);
  const answer = template.answer(params);
  const seen = new Set<number>([answer]);
  const picks: Distractor[] = [];
  for (const d of template.distractors(params)) {
    if (!Number.isFinite(d.value) || seen.has(d.value)) continue;
    seen.add(d.value);
    picks.push(d);
    if (picks.length === 3) break;
  }
  const options = [{ value: answer, why: "", correct: true }, ...picks.map((d) => ({ value: d.value, why: d.why, correct: false }))];
  shuffle(options, rng);
  return {
    templateId: template.id,
    params,
    stem: template.stem(params),
    choices: options.map((o) => String(o.value)),
    correctIndex: options.findIndex((o) => o.correct),
    answer,
    rationales: options.map((o) => o.why),
    tags: template.tags ?? [],
  };
}

/**
 * Generate up to `count` distinct variants (by stem) from a template, seeded for reproducibility.
 * Returns *fewer* than `count` if the template's parameter space is smaller — it bails after a run of
 * consecutive duplicates rather than spinning, so the cost is O(space + count), not O(count × 50).
 */
export function generateBank(template: ItemTemplate, count: number, seed = 0): GeneratedItem[] {
  const rng = makeRng(seed);
  const out: GeneratedItem[] = [];
  const seenStems = new Set<string>();
  let stale = 0;
  const staleLimit = Math.max(count, 64);
  while (out.length < count) {
    const item = generateItem(template, rng);
    if (seenStems.has(item.stem)) {
      if (++stale > staleLimit) break; // parameter space likely exhausted
      continue;
    }
    stale = 0;
    seenStems.add(item.stem);
    out.push(item);
  }
  return out;
}

// ---- Built-in templates ------------------------------------------------------------------------

export const additionTemplate: ItemTemplate = {
  id: "addition",
  tags: ["arithmetic", "addition"],
  sample: (rng) => ({ a: rng.int(11, 49), b: rng.int(11, 49) }),
  stem: (p) => `${p.a} + ${p.b} = ?`,
  answer: (p) => p.a! + p.b!,
  distractors: (p) => [
    { value: Math.abs(p.a! - p.b!), why: "subtracted instead of adding" },
    { value: p.a! + p.b! - 10, why: "forgot to carry the ten" },
    { value: p.a! + p.b! + 1, why: "off-by-one counting slip" },
  ],
};

export const multiplicationTemplate: ItemTemplate = {
  id: "multiplication",
  tags: ["arithmetic", "multiplication"],
  sample: (rng) => ({ a: rng.int(3, 9), b: rng.int(3, 12) }),
  stem: (p) => `${p.a} × ${p.b} = ?`,
  answer: (p) => p.a! * p.b!,
  distractors: (p) => [
    { value: p.a! + p.b!, why: "added instead of multiplying" },
    { value: p.a! * (p.b! - 1), why: "skip-counted one group short" },
    { value: p.a! * (p.b! + 1), why: "counted one extra group" },
  ],
};

export const linearEquationTemplate: ItemTemplate = {
  id: "linear-equation",
  tags: ["algebra", "equations"],
  sample: (rng) => {
    const a = rng.int(2, 6);
    const x = rng.int(2, 9);
    const b = rng.int(1, 12);
    return { a, x, b, c: a * x + b };
  },
  stem: (p) => `Solve for x:  ${p.a}x + ${p.b} = ${p.c}`,
  answer: (p) => p.x!,
  distractors: (p) => [
    { value: Math.round((p.c! + p.b!) / p.a!), why: "added b instead of subtracting it (sign error)" },
    { value: p.c! - p.b!, why: "forgot to divide by the coefficient" },
    { value: Math.round(p.c! / p.a!) - p.b!, why: "divided before subtracting b" },
  ],
};

/** The built-in templates, by id. */
export const TEMPLATES: Record<string, ItemTemplate> = {
  addition: additionTemplate,
  multiplication: multiplicationTemplate,
  "linear-equation": linearEquationTemplate,
};
