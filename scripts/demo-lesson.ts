/**
 * Render a full narrated counting lesson (audible tone narration + captions) and a
 * representative still. Output in out/. Run via `npm run demo:lesson`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RenderService, LocalObjectStorage, ToneTtsProvider, RuleBasedModeration, buildCountingLesson, renderFrame } from "../src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "out");
mkdirSync(outDir, { recursive: true });

const storage = new LocalObjectStorage(join(outDir, "objects"));
const service = new RenderService({
  storage,
  workDir: join(outDir, "tmp"),
  tts: new ToneTtsProvider(),
  moderation: new RuleBasedModeration(),
  defaultConcurrency: 8,
});

const lesson = buildCountingLesson({ count: 5, topic: "stars", theme: "sunshine", itemShape: "star" });

// A still where the whole lesson is composed.
const stillFrame = Math.min(Math.round(lesson.duration * lesson.fps) - 1, Math.round(6 * lesson.fps));
writeFileSync(join(outDir, "lesson-frame.png"), renderFrame(lesson, stillFrame).toPNG());

console.log(`Rendering ${lesson.width}x${lesson.height} @ ${lesson.fps}fps for ${lesson.duration}s (narration + captions + safety gate) ...`);
const result = await service.render(lesson, { deterministic: false });
if (!result.ok) {
  console.error("render failed:", result);
  process.exit(1);
}
writeFileSync(join(outDir, "lesson-narrated.mp4"), await storage.get(result.video.key));
if (result.captions) writeFileSync(join(outDir, "lesson-narrated.vtt"), await storage.get(result.captions.key));
console.log(`Wrote out/lesson-narrated.mp4 (audio=${result.hasAudio}, captions=${!!result.captions}), out/lesson-frame.png`);
