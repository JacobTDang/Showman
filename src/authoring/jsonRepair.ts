/**
 * Tolerant JSON extraction for LLM author output.
 *
 * Open models wrap their JSON in markdown fences, add a sentence of preamble, or emit
 * a trailing comma the strict parser rejects. Rather than burn a whole LLM round-trip
 * re-asking for "just the JSON", we mechanically recover it here:
 *
 *   strip code fences → slice the first balanced {…} object → JSON.parse
 *     → on failure, apply safe string-aware repairs (trailing commas) → JSON.parse.
 *
 * Every step is conservative: the balanced slicer is string-aware (a `}` inside a
 * string never closes the object), and the comma repair only removes commas that sit
 * outside strings immediately before a `}`/`]`. Nothing here guesses at content.
 */

/** If the text contains a ```…``` (optionally ```json) code block, return its body. */
function stripFences(text: string): string {
  const m = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return m ? m[1]! : text;
}

/**
 * Return the first balanced JSON object substring (string-aware), or null if there is
 * no `{` or the braces never balance. Does not parse — just slices.
 */
export function sliceBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Remove trailing commas (a comma whose next non-whitespace char is `}` or `]`).
 * String-aware: commas and closers inside string literals are left untouched.
 */
export function repairJsonText(s: string): string {
  const remove = new Set<number>();
  let inStr = false;
  let esc = false;
  let pendingComma = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      pendingComma = -1;
      continue;
    }
    if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") continue; // whitespace keeps a pending comma alive
    if (ch === ",") {
      pendingComma = i;
      continue;
    }
    if ((ch === "}" || ch === "]") && pendingComma >= 0) remove.add(pendingComma);
    pendingComma = -1;
  }
  if (remove.size === 0) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) if (!remove.has(i)) out += s[i];
  return out;
}

/**
 * Extract a JSON value from a (possibly chatty / fenced / slightly-malformed) string.
 * Throws only if no recoverable JSON object is present.
 */
export function extractJson(text: string): unknown {
  const body = stripFences(text);
  const candidate = sliceBalancedJson(body) ?? body.trim();
  if (!candidate) throw new Error("no JSON object in author response");
  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through to repair */
  }
  try {
    return JSON.parse(repairJsonText(candidate));
  } catch (e) {
    throw new Error(`could not parse JSON from author response: ${(e as Error).message}`);
  }
}
