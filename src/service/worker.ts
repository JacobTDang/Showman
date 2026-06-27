/**
 * Stateless render worker entry point. Wires local object storage + the render
 * service + the HTTP surface and listens. In production this is the image baked in
 * M1.4 and cloned horizontally in M3.
 *
 * Env: PORT, SHOWMAN_DATA_DIR, SHOWMAN_PUBLIC_URL, SHOWMAN_CONCURRENCY.
 */

import { join } from "node:path";
import { LocalObjectStorage } from "./storage.js";
import { RenderService } from "./renderService.js";
import { createServer, listen } from "./httpServer.js";
import { InMemoryJobStore, JobRunner } from "./jobs.js";
import { defaultConcurrency } from "../render/framePool.js";
import { SilentTtsProvider } from "../audio/tts.js";
import { RuleBasedModeration } from "../safety/moderation.js";
import { DirectBackend } from "../mcp/showmanTools.js";
import { AuthoringAgent } from "../authoring/agent.js";
import { createDefaultAuthor } from "../authoring/templateAuthor.js";

export async function startWorker(): Promise<{ port: number; close: () => Promise<void> }> {
  const dataDir = process.env.SHOWMAN_DATA_DIR ?? join(process.cwd(), "data");
  const publicUrl = process.env.SHOWMAN_PUBLIC_URL ?? "";
  const storage = new LocalObjectStorage(join(dataDir, "objects"), publicUrl ? `${publicUrl}/objects` : "");
  const service = new RenderService({
    storage,
    workDir: join(dataDir, "tmp"),
    defaultConcurrency: Number(process.env.SHOWMAN_CONCURRENCY ?? defaultConcurrency()),
    // Narrated + safety-gated by default for a children's product.
    tts: new SilentTtsProvider(),
    moderation: new RuleBasedModeration(),
  });
  const jobRunner = new JobRunner(service, new InMemoryJobStore(), {
    maxConcurrent: Number(process.env.SHOWMAN_JOB_CONCURRENCY ?? 2),
  });
  // brief -> spec -> submit, in one call. Uses the LLM author if ANTHROPIC_API_KEY
  // is set, otherwise the offline template author.
  const authoringAgent = new AuthoringAgent(new DirectBackend(service, jobRunner), createDefaultAuthor(), { maxAttempts: 3 });
  const server = createServer({ service, storage, jobRunner, authoringAgent });
  const port = await listen(server, Number(process.env.PORT ?? 8080), "0.0.0.0");
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// Run if invoked directly (not when imported).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("worker.ts") || process.argv[1]?.endsWith("worker.js")) {
  void startWorker().then(({ port }) => console.log(`[showman] render worker listening on :${port}`));
}
