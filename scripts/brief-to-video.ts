/**
 * The product flow end to end: a plain-English brief -> a finished, narrated video.
 *   npm run brief -- "teach counting to four balloons in a magical fairy land"
 * Uses the LLM author if ANTHROPIC_API_KEY is set, otherwise the offline template
 * author. Output in out/.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RenderService, LocalObjectStorage, InMemoryJobStore, JobRunner, DirectBackend,
  AuthoringAgent, createDefaultAuthor, ToneTtsProvider, RuleBasedModeration, renderFrame,
} from "../src/index.js";
import type { SceneSpec } from "../src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "out");
mkdirSync(outDir, { recursive: true });

const brief = process.argv.slice(2).join(" ").trim() || "teach counting to four balloons in a magical fairy land";

const storage = new LocalObjectStorage(join(outDir, "objects"));
const service = new RenderService({
  storage,
  workDir: join(outDir, "tmp"),
  tts: new ToneTtsProvider(),
  moderation: new RuleBasedModeration(),
  defaultConcurrency: 8,
});
const jobRunner = new JobRunner(service, new InMemoryJobStore(), { maxConcurrent: 1 });
const agent = new AuthoringAgent(new DirectBackend(service, jobRunner), createDefaultAuthor(), { maxAttempts: 3, preview: true });

console.log(`Brief: "${brief}"`);
console.log("Authoring + rendering ...");
const result = await agent.run(brief);
if (!result.ok || !result.jobId) {
  console.error("authoring failed:", result);
  process.exit(1);
}

// Save a still from the authored spec.
const spec = result.spec as SceneSpec;
const stillFrame = Math.min(Math.round(spec.duration * spec.fps) - 1, Math.round((spec.duration - 1) * spec.fps));
writeFileSync(join(outDir, "brief-lesson-frame.png"), renderFrame(spec, Math.max(0, stillFrame)).toPNG());

// Poll the job to completion, then write the video.
let view = await jobRunner.status(result.jobId);
for (let i = 0; i < 600 && view && view.status !== "done" && view.status !== "error"; i++) {
  await new Promise((r) => setTimeout(r, 50));
  view = await jobRunner.status(result.jobId);
}
if (!view || view.status !== "done" || !view.result) {
  console.error("render did not finish:", view);
  process.exit(1);
}
writeFileSync(join(outDir, "brief-lesson.mp4"), await storage.get(view.result.video.key));
console.log(`Done in ${result.attempts} attempt(s). Wrote out/brief-lesson.mp4 (${view.result.durationSec}s) + out/brief-lesson-frame.png`);
