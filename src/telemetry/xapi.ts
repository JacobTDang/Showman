/**
 * xAPI (Experience API) statements — the standard learning-telemetry record that any LRS /
 * LMS can ingest. We emit statements from interaction results and mastery changes so a lesson
 * can report watch-through, answers, and skill mastery to schools' systems.
 *
 * Child-safety by design (COPPA): the actor is PSEUDONYMOUS — a caller-supplied opaque id, no
 * name/email/PII — and statements carry no behavioral-ad signal. Timestamps come from a
 * passed-in `now` (epoch ms), so emission is deterministic and clock-free.
 */

import type { InteractionCue } from "../interaction/types.js";
import type { GradeResult } from "../interaction/runtime.js";
import type { LearnerModel } from "../learning/model.js";
import { isMastered } from "../learning/bkt.js";

export interface Actor {
  objectType: "Agent";
  /** Pseudonymous account — an opaque learner id under a homePage namespace. No PII. */
  account: { homePage: string; name: string };
}

export interface Verb {
  id: string;
  display: Record<string, string>;
}

export interface XapiObject {
  id: string;
  definition?: { name?: Record<string, string>; description?: Record<string, string>; type?: string };
}

export interface XapiResult {
  success?: boolean;
  completion?: boolean;
  response?: string;
  score?: { scaled?: number; raw?: number; min?: number; max?: number };
}

export interface XapiStatement {
  actor: Actor;
  verb: Verb;
  object: XapiObject;
  result?: XapiResult;
  /** ISO-8601 timestamp. */
  timestamp: string;
  context?: { contextActivities?: { parent?: XapiObject[]; grouping?: XapiObject[] } };
}

/** Standard ADL verb IRIs (+ the xAPI Video Profile's initialized/completed for media). */
export const VERBS: Record<string, Verb> = {
  initialized: { id: "http://adlnet.gov/expapi/verbs/initialized", display: { "en-US": "initialized" } },
  answered: { id: "http://adlnet.gov/expapi/verbs/answered", display: { "en-US": "answered" } },
  passed: { id: "http://adlnet.gov/expapi/verbs/passed", display: { "en-US": "passed" } },
  failed: { id: "http://adlnet.gov/expapi/verbs/failed", display: { "en-US": "failed" } },
  mastered: { id: "http://adlnet.gov/expapi/verbs/mastered", display: { "en-US": "mastered" } },
  completed: { id: "http://adlnet.gov/expapi/verbs/completed", display: { "en-US": "completed" } },
};

const CMI_INTERACTION = "http://adlnet.gov/expapi/activities/cmi.interaction";
const VIDEO_ACTIVITY = "https://w3id.org/xapi/video/activity-type/video";

const iso = (now: number): string => new Date(now).toISOString();

/** A pseudonymous learner actor — `id` is an opaque token, never a name/email. */
export function learnerActor(id: string, homePage = "https://showman.app/learners"): Actor {
  return { objectType: "Agent", account: { homePage, name: id } };
}

export interface EmitContext {
  actor: Actor;
  /** Stable id for the lesson/video (used to namespace cue + activity ids). */
  lessonId: string;
  now: number;
}

/** An `answered` statement for a graded cue. Returns null for ungraded cues (e.g. pausePrompt). */
export function answeredStatement(ctx: EmitContext, cue: InteractionCue, grade: GradeResult, response: unknown): XapiStatement | null {
  if (!grade.graded) return null;
  return {
    actor: ctx.actor,
    verb: grade.correct ? VERBS.passed! : VERBS.failed!,
    object: {
      id: `${ctx.lessonId}/interactions/${cue.id}`,
      definition: { name: { "en-US": cue.prompt }, type: CMI_INTERACTION },
    },
    result: {
      success: grade.correct,
      response: response === null || response === undefined ? "" : String(response),
      score: { scaled: grade.correct ? 1 : 0 },
    },
    timestamp: iso(ctx.now),
    context: { contextActivities: { parent: [{ id: ctx.lessonId, definition: { type: VIDEO_ACTIVITY } }] } },
  };
}

/** `initialized` (lesson started) and `completed` (lesson finished) statements for the video. */
export function lessonStatement(ctx: EmitContext, verb: "initialized" | "completed"): XapiStatement {
  return {
    actor: ctx.actor,
    verb: VERBS[verb]!,
    object: { id: ctx.lessonId, definition: { type: VIDEO_ACTIVITY } },
    ...(verb === "completed" ? { result: { completion: true } } : {}),
    timestamp: iso(ctx.now),
  };
}

/** `mastered` statements for every skill that crossed the mastery threshold between two models. */
export function masteredStatements(ctx: EmitContext, before: LearnerModel, after: LearnerModel, threshold = 0.95): XapiStatement[] {
  const out: XapiStatement[] = [];
  for (const kc of Object.keys(after.kcs)) {
    const wasMastered = isMastered(before.kcs[kc]?.pKnown ?? 0, threshold);
    const nowMastered = isMastered(after.kcs[kc]!.pKnown, threshold);
    if (!wasMastered && nowMastered) {
      out.push({
        actor: ctx.actor,
        verb: VERBS.mastered!,
        object: {
          id: `${ctx.lessonId}/skills/${kc}`,
          definition: { name: { "en-US": kc }, type: "http://adlnet.gov/expapi/activities/objective" },
        },
        result: { success: true, completion: true, score: { scaled: 1 } },
        timestamp: iso(ctx.now),
      });
    }
  }
  return out;
}
