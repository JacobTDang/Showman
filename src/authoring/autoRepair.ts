/**
 * Mechanical, zero-LLM repair of a spec against its own validation errors.
 *
 * The validator already pinpoints each problem with a machine `code`, a `path`, and —
 * for typos — a "Did you mean …" suggestion (its built-in Levenshtein hints). Many of
 * those are trivially fixable without asking the model again:
 *
 *   • UNSUPPORTED_VERSION → set specVersion to the engine version
 *   • UNKNOWN_PROPERTY    → rename the key to the suggested one (colour→color, widht→width)
 *   • INVALID_PROPERTY    → rename a non-animatable track property to the suggestion
 *   • INVALID_EASING      → replace an unknown easing with the suggested one
 *   • OUT_OF_RANGE        → clamp a numeric value into the stated [min, max]
 *
 * Applied to a deep clone (the caller's object is never mutated) before the agent
 * spends another LLM round-trip. Anything it can't safely fix is left for the model.
 */

import type { ValidationError } from "../validator/validate.js";
import { SPEC_VERSION } from "../spec/schema.js";

export interface AutoRepairResult {
  /** A deep clone with the safe fixes applied (or the original value if unrepairable). */
  spec: unknown;
  /** Human-readable list of the fixes that were applied (empty if none). */
  fixed: string[];
}

type Step = { kind: "key"; key: string } | { kind: "index"; index: number };

/** Parse a validator path like `nodes[2].tracks[0].keyframes[1].t` into steps. */
function parsePath(path: string): Step[] {
  const steps: Step[] = [];
  for (const seg of path.split(".")) {
    if (seg === "" || seg === "$") continue;
    const name = seg.replace(/\[\d+\]/g, "");
    if (name) steps.push({ kind: "key", key: name });
    const brackets = seg.match(/\[(\d+)\]/g);
    if (brackets) for (const b of brackets) steps.push({ kind: "index", index: Number(b.slice(1, -1)) });
  }
  return steps;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readStep(container: unknown, s: Step): unknown {
  if (s.kind === "index") return Array.isArray(container) ? container[s.index] : undefined;
  return isRecord(container) ? container[s.key] : undefined;
}

function writeStep(container: Record<string, unknown> | unknown[], s: Step, value: unknown): void {
  if (s.kind === "index") {
    if (Array.isArray(container)) container[s.index] = value;
  } else if (isRecord(container)) {
    container[s.key] = value;
  }
}

/** Resolve the container holding the final step (the "parent"), or null if unreachable. */
function resolveParent(root: unknown, steps: Step[]): { parent: Record<string, unknown> | unknown[]; last: Step } | null {
  if (steps.length === 0) return null;
  let cur: unknown = root;
  for (let i = 0; i < steps.length - 1; i++) {
    cur = readStep(cur, steps[i]!);
  }
  if (!isRecord(cur) && !Array.isArray(cur)) return null;
  return { parent: cur, last: steps[steps.length - 1]! };
}

function suggestionFrom(message: string): string | undefined {
  return message.match(/Did you mean "([^"]+)"/)?.[1];
}

function rangeFrom(message: string): { min?: number; max?: number } | undefined {
  const between = message.match(/between (-?\d+(?:\.\d+)?) and (-?\d+(?:\.\d+)?)/);
  if (between) return { min: Number(between[1]), max: Number(between[2]) };
  const ge = message.match(/(?:≥|>=)\s*(-?\d+(?:\.\d+)?)/);
  if (ge) return { min: Number(ge[1]) };
  return undefined;
}

/** Apply a single error's fix in place. Returns a description, or null if not fixable. */
function applyOne(root: unknown, e: ValidationError): string | null {
  if (e.code === "UNSUPPORTED_VERSION") {
    if (isRecord(root)) {
      root.specVersion = SPEC_VERSION;
      return `set specVersion=${SPEC_VERSION}`;
    }
    return null;
  }

  const res = resolveParent(root, parsePath(e.path));
  if (!res) return null;
  const { parent, last } = res;

  if (e.code === "UNKNOWN_PROPERTY") {
    if (last.kind !== "key" || !isRecord(parent) || !(last.key in parent)) return null;
    const sug = suggestionFrom(e.message);
    if (!sug) return null;
    if (sug in parent) {
      delete parent[last.key];
      return `dropped duplicate key "${last.key}"`;
    }
    parent[sug] = parent[last.key];
    delete parent[last.key];
    return `renamed "${last.key}" → "${sug}"`;
  }

  if (e.code === "INVALID_PROPERTY" || e.code === "INVALID_EASING") {
    const sug = suggestionFrom(e.message);
    if (!sug) return null;
    writeStep(parent, last, sug);
    return `set ${e.path} = "${sug}"`;
  }

  if (e.code === "OUT_OF_RANGE") {
    const range = rangeFrom(e.message);
    if (!range) return null;
    const cur = readStep(parent, last);
    if (typeof cur !== "number" || !Number.isFinite(cur)) return null;
    let v = cur;
    if (range.max !== undefined) v = Math.min(range.max, v);
    if (range.min !== undefined) v = Math.max(range.min, v);
    if (v === cur) return null;
    writeStep(parent, last, v);
    return `clamped ${e.path} ${cur} → ${v}`;
  }

  return null;
}

/**
 * Repair `spec` against `errors` without an LLM. Returns a deep clone with the safe
 * mechanical fixes applied and the list of what changed; the caller should re-validate
 * the result (some fixes may expose or resolve others).
 */
export function autoRepairSpec(spec: unknown, errors: readonly ValidationError[]): AutoRepairResult {
  if (spec === null || typeof spec !== "object") return { spec, fixed: [] };
  const clone = structuredClone(spec);
  const fixed: string[] = [];
  for (const e of errors) {
    try {
      const note = applyOne(clone, e);
      if (note) fixed.push(note);
    } catch {
      /* an un-navigable path is just skipped — never throw from a repair */
    }
  }
  return { spec: clone, fixed };
}
