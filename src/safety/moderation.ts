/**
 * M5.7 — Content-safety gate.
 *
 * A children's product cannot ship agent-generated text or imagery without a
 * moderation pass and an approval step. This is a *release blocker*, not a
 * nice-to-have. The rule-based provider is a fast first line (obvious-unsafe terms);
 * a model-backed provider plugs in behind the same interface for nuance, and a human
 * review/approval step gates publish.
 */

import type { SceneSpec, Node } from "../spec/types.js";

export type Severity = "block" | "warn";

export interface ModerationFinding {
  severity: Severity;
  category: string;
  term: string;
  where: string;
  text: string;
}

export interface ModerationResult {
  safe: boolean;
  findings: ModerationFinding[];
}

export interface ModeratableItem {
  text: string;
  where: string;
}

export interface ModerationProvider {
  check(items: ModeratableItem[]): Promise<ModerationResult>;
}

/** Default category lexicons. Illustrative, not exhaustive — a model handles nuance. */
const DEFAULT_CATEGORIES: Record<string, { severity: Severity; terms: string[] }> = {
  violence: { severity: "block", terms: ["kill", "gun", "blood", "weapon", "stab", "shoot", "murder", "knife", "die", "dead"] },
  profanity: { severity: "block", terms: ["damn", "hell", "crap"] },
  adult: { severity: "block", terms: ["sex", "drug", "alcohol", "beer", "cigarette"] },
  scary: { severity: "warn", terms: ["monster", "nightmare", "demon", "ghost", "scary", "terrifying"] },
};

function wordRegex(term: string): RegExp {
  // Match the term at a word start, tolerating a common inflection (plural/past/gerund) so "guns",
  // "killed", "shooting" are caught — without matching mid-word substrings ("skill" → no: the term
  // must follow a non-letter) or false friends ("diet"/"diesel" → "et"/"sel" aren't valid suffixes).
  // Case-insensitive; escapes regex metachars in the term.
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${esc}(e?s|ed|ing|d)?([^a-z]|$)`, "i");
}

/** Fast lexical moderation. `safe` is false iff any "block"-severity term matched. */
export class RuleBasedModeration implements ModerationProvider {
  private readonly categories: Record<string, { severity: Severity; terms: string[] }>;

  constructor(categories: Record<string, { severity: Severity; terms: string[] }> = DEFAULT_CATEGORIES) {
    this.categories = categories;
  }

  async check(items: ModeratableItem[]): Promise<ModerationResult> {
    const findings: ModerationFinding[] = [];
    for (const item of items) {
      for (const [category, { severity, terms }] of Object.entries(this.categories)) {
        for (const term of terms) {
          if (wordRegex(term).test(item.text)) {
            findings.push({ severity, category, term, where: item.where, text: item.text });
          }
        }
      }
    }
    return { safe: !findings.some((f) => f.severity === "block"), findings };
  }
}

/** Collect every human-readable string in a scene (node text + narration). */
export function collectSceneTexts(spec: SceneSpec): ModeratableItem[] {
  const items: ModeratableItem[] = [];
  const walk = (nodes: Node[], prefix: string) => {
    nodes.forEach((node, i) => {
      const where = `${prefix}nodes[${i}](${node.id})`;
      if (node.type === "text") items.push({ text: node.text, where: `${where}.text` });
      if (node.type === "group") walk(node.children, `${where}.`);
    });
  };
  walk(spec.nodes, "");
  (spec.narration?.segments ?? []).forEach((seg, i) => items.push({ text: seg.text, where: `narration.segments[${i}].text` }));
  return items;
}

/** Moderate a whole scene. Returns `{ safe, findings }`; never throws. */
export async function moderateScene(spec: SceneSpec, provider: ModerationProvider = new RuleBasedModeration()): Promise<ModerationResult> {
  return provider.check(collectSceneTexts(spec));
}
