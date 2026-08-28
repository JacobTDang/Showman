import type { SceneSpec } from "../spec/types.js";
import { renderFrame } from "../engine/render.js";
import { validateScene } from "../validator/validate.js";
import { checkSemanticAdherence, type PedagogyRequest, type SemanticCheck } from "./semantic.js";

export interface EvalProvenance {
  author: string;
  model?: string;
  provider?: string;
}

export interface GenerationScorecard {
  passed: boolean;
  structural: { score: number; valid: boolean; errors: number };
  semantic: SemanticCheck & { score: number; numericAnchors: string[]; missingNumericAnchors: string[] };
  pedagogical: { score: number; objectiveCoverage: number; progressionBeats: number };
  visual: { score: number; sampledFrames: number; nonBlankFrames: number; relevant: boolean };
  provenance: EvalProvenance;
}

function corpus(spec: SceneSpec): string {
  return JSON.stringify(spec).normalize("NFKD").toLowerCase();
}

function numericAnchors(request: PedagogyRequest): string[] {
  const explicit = [...(request.mustShow ?? []), ...(request.objectives ?? [])].join(" ");
  return [...new Set(explicit.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [])];
}

function inkRatio(spec: SceneSpec, frame: number): number {
  const pixels = renderFrame(spec, frame).pixels;
  let changing = 0;
  const r0 = pixels[0] ?? 0;
  const g0 = pixels[1] ?? 0;
  const b0 = pixels[2] ?? 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.abs((pixels[i] ?? 0) - r0) + Math.abs((pixels[i + 1] ?? 0) - g0) + Math.abs((pixels[i + 2] ?? 0) - b0) > 18) changing++;
  }
  return changing / (pixels.length / 4);
}

/** Existing two-tier eval framework's deterministic per-scene scorecard. */
export function evaluateGeneration(spec: SceneSpec, request: PedagogyRequest, provenance: EvalProvenance): GenerationScorecard {
  const validation = validateScene(spec);
  const structuralScore = validation.valid ? 1 : 0;
  const semantic = checkSemanticAdherence(spec, request);
  const numbers = numericAnchors(request);
  const text = corpus(spec);
  const missingNumbers = numbers.filter((n) => !text.includes(n.toLowerCase()));
  const semanticScore =
    semantic.required.length + numbers.length === 0
      ? 1
      : (semantic.required.length - semantic.missing.length + numbers.length - missingNumbers.length) /
        (semantic.required.length + numbers.length);

  const objectives = request.objectives ?? [];
  const coveredObjectives = objectives.filter((objective) =>
    objective
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
      .some((w) => text.includes(w)),
  ).length;
  const objectiveCoverage = objectives.length ? coveredObjectives / objectives.length : 1;
  const narration = spec.narration?.segments?.map((s) => s.text) ?? [];
  const textNodes = (text.match(/"type":"text"/g) ?? []).length;
  const progressionBeats = Math.max(narration.length, textNodes);
  const requestedDepth = request.depth ?? "standard";
  const minBeats = requestedDepth === "deep" ? 4 : requestedDepth === "quick" ? 1 : 2;
  const pedagogicalScore = Math.min(1, (objectiveCoverage + Math.min(1, progressionBeats / minBeats)) / 2);

  const totalFrames = Math.max(1, Math.ceil(spec.duration * spec.fps));
  const frames = [...new Set([0, Math.floor((totalFrames - 1) / 2), totalFrames - 1])];
  const nonBlank = validation.valid ? frames.filter((frame) => inkRatio(spec, frame) > 0.0005).length : 0;
  const relevant = semantic.passed && missingNumbers.length === 0;
  const visualScore = frames.length ? (nonBlank / frames.length + (relevant ? 1 : 0)) / 2 : 0;

  const passed = structuralScore === 1 && semanticScore === 1 && pedagogicalScore >= 0.75 && visualScore >= 0.75;
  return {
    passed,
    structural: { score: structuralScore, valid: validation.valid, errors: validation.errors.length },
    semantic: { ...semantic, score: semanticScore, numericAnchors: numbers, missingNumericAnchors: missingNumbers },
    pedagogical: { score: pedagogicalScore, objectiveCoverage, progressionBeats },
    visual: { score: visualScore, sampledFrames: frames.length, nonBlankFrames: nonBlank, relevant },
    provenance,
  };
}
