/**
 * Live image-generation test — hits the real configured endpoint. Gated on an API key, so it
 * is skipped in CI and offline dev. Run with SHOWMAN_IMAGE_API_KEY (or OPENAI_API_KEY) set:
 *   SHOWMAN_IMAGE_API_KEY=... npx vitest run test/assets/imageGen.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { createImageGenerator } from "../../src/assets/imageGen.js";

const RUN = !!(process.env.SHOWMAN_IMAGE_API_KEY || process.env.OPENAI_API_KEY);

describe.skipIf(!RUN)("HttpImageGenerator (live)", () => {
  it("generates a real PNG from a prompt", async () => {
    const out = await createImageGenerator().generate({ kind: "image", prompt: "a friendly cartoon apple, flat vector, kids' book illustration" });
    expect(out.bytes.length).toBeGreaterThan(100);
    expect(out.bytes.subarray(1, 4).toString()).toBe("PNG");
  }, 60_000);
});
