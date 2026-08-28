import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OpenRouterSpecAuthor, describeScene, validateScene } from "../../src/index.js";
import { evaluateGeneration } from "../../src/authoring/evaluation.js";
import { checkSemanticAdherence, type PedagogyRequest } from "../../src/authoring/semantic.js";
import type { SceneSpec, ValidationError } from "../../src/index.js";

const hasKey = !!process.env.OPENROUTER_API_KEY;

describe.skipIf(!hasKey)("live semantic and pedagogical eval", () => {
  it("rejects unrelated valid output and records the resolved routing provenance", async () => {
    const request: PedagogyRequest = {
      brief: "Teach RC capacitor charging from switch closure through the time constant",
      topic: "RC charging",
      depth: "deep",
      objectives: ["Connect decreasing current to increasing capacitor voltage", "Derive the exponential charging equation"],
      mustShow: ["battery", "resistor", "capacitor", "v_C(t)", "63.2%"],
    };
    const author = new OpenRouterSpecAuthor({ model: process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b" });
    const schema = describeScene();
    let spec: SceneSpec | undefined;
    let feedback: { errors?: ValidationError[]; note?: string } | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const candidate = await author.propose(`${request.brief}\nRequired: ${request.mustShow!.join(", ")}`, {
        schema,
        attempt,
        ...(feedback ? { feedback } : {}),
      });
      const structural = validateScene(candidate);
      if (!structural.valid) {
        feedback = { errors: structural.errors };
        continue;
      }
      const semantic = checkSemanticAdherence(candidate as SceneSpec, request);
      if (!semantic.passed) {
        feedback = { note: `Missing semantic anchors: ${semantic.missing.join(", ")}` };
        continue;
      }
      spec = candidate as SceneSpec;
      break;
    }
    expect(spec).toBeDefined();
    const score = evaluateGeneration(spec!, request, author.provenance());
    writeFileSync("semantic-live-scorecard.json", JSON.stringify(score, null, 2));
    expect(score.provenance.model).toBeTruthy();
    expect(score.provenance.provider).toBeTruthy();
    expect(score.structural.score).toBe(1);
    expect(score.semantic.score).toBe(1);
    expect(score.pedagogical.score).toBeGreaterThanOrEqual(0.75);
    expect(score.visual.score).toBeGreaterThanOrEqual(0.75);
  }, 190_000);
});
