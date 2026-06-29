/**
 * Interaction track — the data model for turning a pre-rendered lesson video into an
 * interactive one. Interactions are a *sidecar* (like captions): the deterministic
 * renderer never sees them, so frames stay byte-identical. A thin player overlays each
 * cue onto the video at its time `t` (typically a narration-beat timestamp), pauses,
 * grades the response locally, and resumes.
 */

interface BaseCue {
  /** Unique id within the track. */
  id: string;
  /** Cue time in seconds — when the prompt appears (usually a narration beat `t`). */
  t: number;
  /** The question / instruction shown to the learner. */
  prompt: string;
  /** Pause the video until the learner responds. Default true. */
  pause?: boolean;
  /** Knowledge-component (skill / objective) id this cue assesses — feeds the learner model. */
  kc?: string;
}

/** Multiple choice. `answer` indexes `choices`; `feedback[i]` is optional per-choice (misconception) text. */
export interface McqCue extends BaseCue {
  kind: "mcq";
  choices: string[];
  answer: number;
  feedback?: string[];
  explanation?: string;
}

/** True / false. */
export interface TrueFalseCue extends BaseCue {
  kind: "trueFalse";
  answer: boolean;
  explanation?: string;
}

/** Numeric entry, correct within `tolerance` (absolute, default 0). */
export interface NumericCue extends BaseCue {
  kind: "numeric";
  answer: number;
  tolerance?: number;
  unit?: string;
  explanation?: string;
}

/** Short text entry; any of `accept` (compared case-insensitively, trimmed) is correct. */
export interface FreeResponseCue extends BaseCue {
  kind: "freeResponse";
  accept: string[];
  explanation?: string;
}

/** Click a region of the frame. A region with `correct: true` is the target. */
export interface HotspotCue extends BaseCue {
  kind: "hotspot";
  regions: { x: number; y: number; w: number; h: number; label?: string; correct?: boolean }[];
  explanation?: string;
}

/** Predict-then-reveal: pause and let the learner commit a prediction, then continue. No grading. */
export interface PausePromptCue extends BaseCue {
  kind: "pausePrompt";
}

export type InteractionCue = McqCue | TrueFalseCue | NumericCue | FreeResponseCue | HotspotCue | PausePromptCue;
export type InteractionKind = InteractionCue["kind"];

export interface InteractionTrack {
  cues: InteractionCue[];
}

/** A learner's response to a cue, by kind: index (mcq), boolean (trueFalse), number (numeric),
 * string (freeResponse), region index (hotspot), or null (pausePrompt). */
export type Response = number | boolean | string | null;
