/**
 * Interaction validation — structured, actionable errors (mirroring the scene validator)
 * so an authoring agent can self-correct. Checks cue shape, references, and timing against
 * the scene duration.
 */

import type { InteractionTrack, InteractionCue } from "./types.js";

export interface InteractionError {
  /** JSON-path-like location, e.g. `cues[2].answer`. */
  path: string;
  cueId?: string;
  code: "INVALID_TYPE" | "OUT_OF_RANGE" | "MISSING_FIELD" | "DUPLICATE_ID" | "UNKNOWN_KIND" | "INVALID_VALUE";
  message: string;
}

const KINDS = ["mcq", "trueFalse", "numeric", "freeResponse", "hotspot", "pausePrompt"];
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNonEmptyStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Validate an interaction track. `duration`, if given, bounds cue times. */
export function validateInteractions(track: InteractionTrack, opts: { duration?: number } = {}): InteractionError[] {
  const errors: InteractionError[] = [];
  const err = (e: InteractionError): void => void errors.push(e);
  if (!track || !Array.isArray(track.cues)) {
    return [{ path: "cues", code: "INVALID_TYPE", message: "Interaction track must have a `cues` array." }];
  }

  const seen = new Set<string>();
  track.cues.forEach((cue, i) => {
    const at = `cues[${i}]`;
    const id = (cue as InteractionCue).id;
    if (!isNonEmptyStr(id)) err({ path: `${at}.id`, code: "MISSING_FIELD", message: "Each cue needs a non-empty `id`." });
    else if (seen.has(id)) err({ path: `${at}.id`, cueId: id, code: "DUPLICATE_ID", message: `Duplicate cue id "${id}".` });
    else seen.add(id);

    if (!KINDS.includes(cue.kind)) {
      err({
        path: `${at}.kind`,
        cueId: id,
        code: "UNKNOWN_KIND",
        message: `Unknown cue kind "${cue.kind}"; expected one of ${KINDS.join(", ")}.`,
      });
      return;
    }
    if (!isNonEmptyStr(cue.prompt))
      err({ path: `${at}.prompt`, cueId: id, code: "MISSING_FIELD", message: "Each cue needs a non-empty `prompt`." });
    if (!isFiniteNum(cue.t) || cue.t < 0)
      err({ path: `${at}.t`, cueId: id, code: "OUT_OF_RANGE", message: "`t` must be a number ≥ 0 (seconds)." });
    else if (opts.duration !== undefined && cue.t >= opts.duration)
      err({
        path: `${at}.t`,
        cueId: id,
        code: "OUT_OF_RANGE",
        // Strictly before the end: a cue exactly at the final frame races the player's end screen.
        message: `\`t\` (${cue.t}) must be before the video ends (${opts.duration}s).`,
      });

    switch (cue.kind) {
      case "mcq":
        if (!Array.isArray(cue.choices) || cue.choices.length < 2)
          err({ path: `${at}.choices`, cueId: id, code: "OUT_OF_RANGE", message: "An mcq needs at least 2 `choices`." });
        else if (!Number.isInteger(cue.answer) || cue.answer < 0 || cue.answer >= cue.choices.length)
          err({
            path: `${at}.answer`,
            cueId: id,
            code: "OUT_OF_RANGE",
            message: `\`answer\` must index \`choices\` (0..${cue.choices.length - 1}).`,
          });
        if (cue.feedback !== undefined && (!Array.isArray(cue.feedback) || cue.feedback.length !== cue.choices?.length))
          err({
            path: `${at}.feedback`,
            cueId: id,
            code: "INVALID_VALUE",
            message: "`feedback`, if given, must have one entry per choice.",
          });
        break;
      case "trueFalse":
        if (typeof cue.answer !== "boolean")
          err({ path: `${at}.answer`, cueId: id, code: "INVALID_TYPE", message: "`answer` must be a boolean." });
        break;
      case "numeric":
        if (!isFiniteNum(cue.answer))
          err({ path: `${at}.answer`, cueId: id, code: "INVALID_TYPE", message: "`answer` must be a finite number." });
        if (cue.tolerance !== undefined && (!isFiniteNum(cue.tolerance) || cue.tolerance < 0))
          err({ path: `${at}.tolerance`, cueId: id, code: "OUT_OF_RANGE", message: "`tolerance` must be a number ≥ 0." });
        break;
      case "freeResponse":
        if (!Array.isArray(cue.accept) || cue.accept.length === 0 || !cue.accept.every(isNonEmptyStr))
          err({ path: `${at}.accept`, cueId: id, code: "OUT_OF_RANGE", message: "`accept` must be a non-empty array of answer strings." });
        break;
      case "hotspot":
        if (!Array.isArray(cue.regions) || cue.regions.length === 0)
          err({ path: `${at}.regions`, cueId: id, code: "OUT_OF_RANGE", message: "A hotspot needs at least one region." });
        else {
          cue.regions.forEach((r, j) => {
            if (![r?.x, r?.y, r?.w, r?.h].every(isFiniteNum) || r.w <= 0 || r.h <= 0)
              err({
                path: `${at}.regions[${j}]`,
                cueId: id,
                code: "INVALID_VALUE",
                message: "Each region needs finite x, y and positive w, h.",
              });
          });
          if (!cue.regions.some((r) => r.correct === true))
            err({ path: `${at}.regions`, cueId: id, code: "INVALID_VALUE", message: "At least one region must be `correct: true`." });
        }
        break;
      case "pausePrompt":
        break;
    }
  });
  return errors;
}
