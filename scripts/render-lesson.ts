/**
 * Render the "counting lesson" golden scene to a watchable mp4 (and a preview PNG).
 * Output lands in out/ (gitignored). Run via `npm run demo`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFrame, assertValidScene } from "../src/index.js";
import { encodeSceneToFile } from "../src/encode/encodeVideo.js";
import { GOLDEN_CASES } from "../test/golden/specs.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "out");
mkdirSync(outDir, { recursive: true });

const lesson = GOLDEN_CASES.find((c) => c.name === "lesson");
if (!lesson) throw new Error("lesson golden case not found");
const spec = assertValidScene(lesson.spec);

// A representative still (last frame).
const lastFrame = Math.max(0, Math.round(spec.duration * spec.fps) - 1);
writeFileSync(join(outDir, "lesson.png"), renderFrame(spec, lastFrame).toPNG());

const mp4 = join(outDir, "lesson.mp4");
console.log(`Encoding ${spec.width}x${spec.height} @ ${spec.fps}fps for ${spec.duration}s ...`);
const result = await encodeSceneToFile(spec, {
  outPath: mp4,
  onProgress: (done, total) => {
    if (done === total || done % spec.fps === 0) process.stdout.write(`\r  ${done}/${total} frames`);
  },
});
process.stdout.write("\n");
console.log(`Wrote ${result.outPath} — ${result.frameCount} frames, ${result.durationSec}s`);
