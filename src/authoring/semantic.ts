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
}

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "animated", "animation", "before", "brief", "connect", "current", "demonstrate", "describe",
  "counting", "diagram", "explain", "flowing", "from", "friendly", "into", "lesson", "make", "show", "simple", "teach", "that", "their", "then",
  "through", "using", "video", "what", "when", "where", "which", "while", "with", "why", "would", "it",
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

function present(corpus: string, anchor: string): boolean {
  const words = normalize(anchor).split(" ").filter(Boolean);
  return words.length > 0 && words.every((word) => corpus.includes(word));
}

/** Content-bearing terms from any topic, rather than a fixed list of supported subjects. */
function inferredAnchors(request: PedagogyRequest): string[] {
  const source = normalize(`${request.topic ?? ""} ${request.brief}`);
  return [
    ...new Set(
      source
        .split(" ")
        .filter((word) => word.length >= 4)
        .filter((word) => !STOP_WORDS.has(word) && !/^\d+$/.test(word)),
    ),
  ].slice(0, 10);
}

/** Cheap, deterministic guard against a valid scene about an unrelated subject. */
export function checkSemanticAdherence(spec: SceneSpec, request: PedagogyRequest): SemanticCheck {
  const explicit = [...new Set(request.mustShow ?? [])];
  // Explicit mustShow constraints are authoritative and conjunctive. Otherwise,
  // derived terms form a disjunctive relevance signal: one visible match proves
  // the scene is about the requested topic without requiring every word verbatim.
  const inferred = explicit.length === 0 ? inferredAnchors(request) : [];
  const required = [...explicit, ...inferred];
  const forbidden = [...new Set(request.forbid ?? [])];
  const corpus = visibleCorpus(spec);
  const missingExplicit = explicit.filter((anchor) => !present(corpus, anchor));
  const inferredMatched = inferred.length === 0 || inferred.some((anchor) => present(corpus, anchor));
  const missing = [...missingExplicit, ...(!inferredMatched ? inferred : [])];
  const foundForbidden = forbidden.filter((anchor) => present(corpus, anchor));
  const checked = required.length > 0 || forbidden.length > 0;
  const passed = checked && missingExplicit.length === 0 && inferredMatched && foundForbidden.length === 0;
  const status = !checked ? "unchecked" : passed ? "passed" : "failed";
  return { status, passed, required, missing, forbidden, foundForbidden };
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
