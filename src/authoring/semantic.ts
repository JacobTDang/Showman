import type { SceneSpec } from "../spec/types.js";

export interface PedagogyRequest {
  brief: string;
  audience?: string;
  objectives?: string[];
  prerequisites?: string[];
  depth?: "quick" | "standard" | "deep";
  mustShow?: string[];
  misconceptions?: string[];
  forbid?: string[];
  topic?: string;
  durationBudgetSec?: number;
  durationMode?: "hard" | "soft";
}

export interface SemanticCheck {
  status: "passed" | "failed" | "unchecked";
  passed: boolean;
  required: string[];
  missing: string[];
  forbidden: string[];
  foundForbidden: string[];
  /** True when `missing` lists inferred alternatives, any one of which would satisfy the check. */
  inferredAlternatives: boolean;
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "animated",
  "animation",
  "before",
  "brief",
  "connect",
  "current",
  "demonstrate",
  "describe",
  "counting",
  "diagram",
  "explain",
  "flowing",
  "from",
  "friendly",
  "into",
  "lesson",
  "make",
  "show",
  "simple",
  "teach",
  "that",
  "their",
  "then",
  "through",
  "using",
  "video",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "why",
  "would",
  "it",
]);

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^a-z0-9%+./=]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleCorpus(spec: SceneSpec): string {
  const visible: string[] = [];
  const visit = (node: SceneSpec["nodes"][number]): void => {
    if (node.type === "text") visible.push(node.text);
    if (node.type === "counter") visible.push(node.prefix ?? "", String(node.value ?? 0), node.suffix ?? "");
    if (node.type === "group") node.children.forEach(visit);
  };
  spec.nodes.forEach(visit);
  visible.push(...(spec.narration?.segments?.map((segment) => segment.text) ?? []));
  return normalize(visible.join(" "));
}

function words(value: string): string[] {
  return value.split(/[^a-z0-9]+/).filter(Boolean);
}

/** Match whole words, not substrings.
 *
 * A raw `includes` let a short anchor hit inside an unrelated word -- "percent"
 * contains "rc", so a percentages lesson satisfied a circuits brief. Comparing
 * against the corpus's own tokens removes that, and a prefix match keeps
 * inflections ("capacitors" still answers "capacitor").
 */
function present(corpus: Set<string>, anchor: string): boolean {
  const parts = words(normalize(anchor));
  return parts.length > 0 && parts.every((part) => [...corpus].some((token) => token.startsWith(part)));
}

/** Short technical tokens carry more topic signal than long descriptive ones.
 *
 * "RC", "RLC", "ADC", "PID", "555" identify a subject precisely, but a length
 * filter drops them, and a scene that answers the brief properly speaks in that
 * notation rather than in the brief's own prose: an RC lesson draws `R`, `C` and
 * `V_C(t) = V_0 (1 - e^(-t/RC))`, and never prints the word "circuit". Recover
 * these from the raw brief, where capitalisation still separates an acronym from
 * an ordinary short word.
 */
function acronymAnchors(request: PedagogyRequest): string[] {
  const source = `${request.topic ?? ""} ${request.brief}`;
  return [...new Set((source.match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? []).map((token) => token.toLowerCase()))];
}

/** Content-bearing terms from any topic, rather than a fixed list of supported subjects. */
function inferredAnchors(request: PedagogyRequest): string[] {
  const source = normalize(`${request.topic ?? ""} ${request.brief}`);
  const words = [
    ...new Set(
      source
        .split(" ")
        .filter((word) => word.length >= 4)
        .filter((word) => !STOP_WORDS.has(word) && !/^\d+$/.test(word)),
    ),
  ];
  // Acronyms lead, so the cap cannot discard the most discriminating anchors.
  return [...new Set([...acronymAnchors(request), ...words])].slice(0, 10);
}

/** Cheap, deterministic guard against a valid scene about an unrelated subject. */
export function checkSemanticAdherence(spec: SceneSpec, request: PedagogyRequest): SemanticCheck {
  const explicit = [...new Set(request.mustShow ?? [])];
  // Explicit mustShow constraints are authoritative and conjunctive. Otherwise,
  // derived terms form a disjunctive relevance signal: one visible match proves
  // the scene is about the requested topic without requiring every word verbatim.
  const acronyms = explicit.length === 0 ? acronymAnchors(request) : [];
  const inferred = explicit.length === 0 ? inferredAnchors(request) : [];
  const required = [...explicit, ...inferred];
  const forbidden = [...new Set(request.forbid ?? [])];
  const corpus = new Set(words(visibleCorpus(spec)));
  const missingExplicit = explicit.filter((anchor) => !present(corpus, anchor));
  // One generic word is not evidence of relevance -- an arithmetic lesson
  // contains "equation" too. An acronym names the subject outright, so one is
  // enough; otherwise two distinct descriptive terms must corroborate.
  const acronymHit = acronyms.some((anchor) => present(corpus, anchor));
  const descriptive = inferred.filter((anchor) => !acronyms.includes(anchor));
  const descriptiveHits = descriptive.filter((anchor) => present(corpus, anchor)).length;
  const inferredMatched = inferred.length === 0 || acronymHit || descriptiveHits >= Math.min(2, descriptive.length);
  const missing = [...missingExplicit, ...(!inferredMatched ? inferred : [])];
  const foundForbidden = forbidden.filter((anchor) => present(corpus, anchor));
  const checked = required.length > 0 || forbidden.length > 0;
  const passed = checked && missingExplicit.length === 0 && inferredMatched && foundForbidden.length === 0;
  const status = !checked ? "unchecked" : passed ? "passed" : "failed";
  return { status, passed, required, missing, forbidden, foundForbidden, inferredAlternatives: !inferredMatched };
}

export function authorBrief(request: PedagogyRequest): string {
  const constraints = {
    ...(request.topic ? { topic: request.topic } : {}),
    ...(request.audience ? { audience: request.audience } : {}),
    ...(request.objectives?.length ? { objectives: request.objectives } : {}),
    ...(request.prerequisites?.length ? { prerequisites: request.prerequisites } : {}),
    ...(request.depth ? { depth: request.depth } : {}),
    ...(request.mustShow?.length ? { mustShow: request.mustShow } : {}),
    ...(request.misconceptions?.length ? { misconceptions: request.misconceptions } : {}),
    ...(request.forbid?.length ? { forbid: request.forbid } : {}),
    ...(request.durationBudgetSec !== undefined ? { durationBudgetSec: request.durationBudgetSec } : {}),
  };
  return Object.keys(constraints).length
    ? `${request.brief}\nPedagogy constraints (must be honored): ${JSON.stringify(constraints)}`
    : request.brief;
}
