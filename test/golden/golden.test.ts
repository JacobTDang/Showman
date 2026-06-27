import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFrame, assertValidScene } from "../../src/index.js";
import { GOLDEN_CASES, goldenFileName } from "./specs.js";

const goldenDir = resolve(dirname(fileURLToPath(import.meta.url)));
const receivedDir = join(goldenDir, "__received__");

/**
 * Golden regression: re-render each blessed scene/frame and assert it reproduces the
 * committed PNG byte-for-byte. On mismatch, the actual output is written to
 * test/golden/__received__/ so it can be eyeballed against the expected file.
 */
describe("golden frames", () => {
  for (const { name, spec, frames } of GOLDEN_CASES) {
    describe(name, () => {
      it("is a valid scene", () => {
        expect(() => assertValidScene(spec)).not.toThrow();
      });

      for (const frame of frames) {
        it(`frame ${frame} reproduces its golden`, () => {
          const file = join(goldenDir, goldenFileName(name, frame));
          const actual = renderFrame(spec, frame).toPNG();

          if (!existsSync(file)) {
            throw new Error(
              `Missing golden ${goldenFileName(name, frame)}. Run \`npm run golden:update\` to generate it.`,
            );
          }

          const expected = readFileSync(file);
          if (Buffer.compare(actual, expected) !== 0) {
            mkdirSync(receivedDir, { recursive: true });
            const out = join(receivedDir, goldenFileName(name, frame));
            writeFileSync(out, actual);
            throw new Error(
              `Golden mismatch for ${goldenFileName(name, frame)} ` +
                `(expected ${expected.length} bytes, got ${actual.length}). ` +
                `Wrote actual to ${out}. If this change is intentional, run \`npm run golden:update\`.`,
            );
          }
          expect(Buffer.compare(actual, expected)).toBe(0);
        });
      }
    });
  }
});
