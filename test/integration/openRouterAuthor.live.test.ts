import { describe, it, expect } from "vitest";
import { OpenRouterSpecAuthor, validateScene, describeScene } from "../../src/index.js";
import type { ValidationError } from "../../src/index.js";

/**
 * LIVE test against OpenRouter — runs ONLY when OPENROUTER_API_KEY is set, so it is
 * skipped in CI (no key, no cost). Proves the LLM author actually produces a valid
 * Scene Spec from a brief, self-correcting against validation errors.
 */
const hasKey = !!process.env.OPENROUTER_API_KEY;

describe.skipIf(!hasKey)("OpenRouter live authoring", () => {
  it("authors a valid lesson from a brief (self-correcting up to 3 attempts)", async () => {
    const author = new OpenRouterSpecAuthor({ model: process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b" });
    const schema = describeScene();
    const brief = "a cheerful lesson teaching counting to three with three friendly stars";

    let spec: unknown;
    let feedback: { errors?: ValidationError[] } | undefined;
    let valid = false;
    for (let attempt = 1; attempt <= 3 && !valid; attempt++) {
      spec = await author.propose(brief, { schema, attempt, ...(feedback ? { feedback } : {}) });
      const result = validateScene(spec);
      valid = result.valid;
      if (!valid) feedback = { errors: result.errors };
    }

    expect(valid).toBe(true);
    const scene = spec as { nodes: unknown[]; specVersion: number };
    expect(scene.specVersion).toBe(1);
    expect(Array.isArray(scene.nodes)).toBe(true);
  }, 180_000);
});
