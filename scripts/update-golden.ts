/**
 * Regenerate the committed golden PNGs. Run via `npm run golden:update` whenever a
 * change to the engine intentionally alters output. Review the resulting image diff
 * before committing — that review is the point of golden tests.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFrame, assertValidScene } from "../src/index.js";
import { GOLDEN_CASES, goldenFileName } from "../test/golden/specs.js";

const goldenDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "test", "golden");
mkdirSync(goldenDir, { recursive: true });

let count = 0;
for (const { name, spec, frames } of GOLDEN_CASES) {
  assertValidScene(spec); // refuse to bless an invalid scene
  for (const frame of frames) {
    const png = renderFrame(spec, frame).toPNG();
    const file = join(goldenDir, goldenFileName(name, frame));
    writeFileSync(file, png);
    count++;
    console.log(`wrote ${goldenFileName(name, frame)} (${png.length} bytes)`);
  }
}
console.log(`\nUpdated ${count} golden frame(s).`);
