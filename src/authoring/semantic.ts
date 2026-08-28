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
  passed: boolean;
  required: string[];
  missing: string[];
  forbidden: string[];
  foundForbidden: string[];
}

const TOPIC_ANCHORS: Array<{ pattern: RegExp; anchors: string[] }> = [
  { pattern: /\b(?:rc|resistor.capacitor|capacitor.resistor|charging circuit)\b/i, anchors: ["resistor", "capacitor"] },
  { pattern: /\bprojectile\b/i, anchors: ["projectile"] },
  { pattern: /\bphotosynthesis\b/i, anchors: ["photosynthesis"] },
];

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^a-z0-9%+./=]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sceneCorpus(spec: SceneSpec): string {
  return normalize(JSON.stringify(spec));
}

function present(corpus: string, anchor: string): boolean {
  const words = normalize(anchor).split(" ").filter(Boolean);
  return words.length > 0 && words.every((word) => corpus.includes(word));
}

/** Cheap, deterministic guard against a valid scene about an unrelated subject. */
export function checkSemanticAdherence(spec: SceneSpec, request: PedagogyRequest): SemanticCheck {
  const inferred = TOPIC_ANCHORS.find(({ pattern }) => pattern.test(`${request.topic ?? ""} ${request.brief}`))?.anchors ?? [];
  const required = [...new Set([...(request.mustShow ?? []), ...inferred])];
  const forbidden = [...new Set(request.forbid ?? [])];
  const corpus = sceneCorpus(spec);
  const missing = required.filter((anchor) => !present(corpus, anchor));
  const foundForbidden = forbidden.filter((anchor) => present(corpus, anchor));
  return { passed: missing.length === 0 && foundForbidden.length === 0, required, missing, forbidden, foundForbidden };
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
