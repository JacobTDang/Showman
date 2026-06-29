/**
 * Mastery dashboard — rolls the learner model up into the view a teacher or parent reads:
 * per-skill mastery, accuracy, status, and next-review, plus overall counts. Optionally maps
 * each skill to a friendly label and a standard (e.g. a CCSS code) for standards reporting.
 * Pure + deterministic.
 */

import type { LearnerModel } from "../learning/model.js";
import { isMastered } from "../learning/bkt.js";

export type SkillStatus = "mastered" | "practicing" | "struggling" | "new";

export interface SkillSummary {
  kc: string;
  label: string;
  standard?: string;
  /** P(known), 0..1. */
  mastery: number;
  attempts: number;
  correct: number;
  /** correct / attempts, 0..1. */
  accuracy: number;
  status: SkillStatus;
  /** Epoch-ms when this skill is next due for review. */
  dueAt: number;
}

export interface Dashboard {
  /** Skills ordered for attention: struggling → practicing → new → mastered, weakest first. */
  skills: SkillSummary[];
  counts: { mastered: number; practicing: number; struggling: number; total: number };
  /** Mean mastery across all tracked skills, 0..1. */
  overallMastery: number;
}

export interface DashboardOptions {
  /** Friendly label + standard code per knowledge component. */
  labels?: Record<string, { label?: string; standard?: string }>;
  /** Mastery threshold. Default 0.95. */
  masteryThreshold?: number;
  /** Below this mastery (with attempts) a skill is "struggling". Default 0.5. */
  strugglingBelow?: number;
}

const ORDER: Record<SkillStatus, number> = { struggling: 0, practicing: 1, new: 2, mastered: 3 };

/** Build the teacher/parent dashboard from a learner model. */
export function buildDashboard(model: LearnerModel, opts: DashboardOptions = {}): Dashboard {
  const masteryT = opts.masteryThreshold ?? 0.95;
  const strugglingT = opts.strugglingBelow ?? 0.5;

  const skills: SkillSummary[] = Object.keys(model.kcs).map((kc) => {
    const s = model.kcs[kc]!;
    const accuracy = s.attempts > 0 ? s.correct / s.attempts : 0;
    const status: SkillStatus =
      s.attempts === 0 ? "new" : isMastered(s.pKnown, masteryT) ? "mastered" : s.pKnown < strugglingT ? "struggling" : "practicing";
    const meta = opts.labels?.[kc];
    return {
      kc,
      label: meta?.label ?? kc,
      ...(meta?.standard ? { standard: meta.standard } : {}),
      mastery: s.pKnown,
      attempts: s.attempts,
      correct: s.correct,
      accuracy,
      status,
      dueAt: s.card.dueAt,
    };
  });

  skills.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.mastery - b.mastery);
  const counts = {
    mastered: skills.filter((s) => s.status === "mastered").length,
    practicing: skills.filter((s) => s.status === "practicing").length,
    struggling: skills.filter((s) => s.status === "struggling").length,
    total: skills.length,
  };
  const overallMastery = skills.length > 0 ? skills.reduce((sum, s) => sum + s.mastery, 0) / skills.length : 0;
  return { skills, counts, overallMastery };
}
