/**
 * MCP server entry point. Backed either in-process (direct) or by HTTP to a gateway.
 * Env: SHOWMAN_MCP_BACKEND ("direct" | "http"), SHOWMAN_GATEWAY_URL, SHOWMAN_DATA_DIR.
 */

import { join } from "node:path";
import { LocalObjectStorage } from "../service/storage.js";
import { RenderService } from "../service/renderService.js";
import { InMemoryJobStore, JobRunner } from "../service/jobs.js";
import { DirectBackend, HttpBackend, type ShowmanClient } from "./showmanTools.js";
import { startMcpServer } from "./server.js";
import { defaultConcurrency } from "../render/framePool.js";

export function buildBackend(): ShowmanClient {
  if ((process.env.SHOWMAN_MCP_BACKEND ?? "direct") === "http") {
    return new HttpBackend(process.env.SHOWMAN_GATEWAY_URL ?? "http://localhost:8080");
  }
  const dataDir = process.env.SHOWMAN_DATA_DIR ?? join(process.cwd(), "data");
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  const service = new RenderService({ storage, workDir: join(dataDir, "tmp"), defaultConcurrency: defaultConcurrency() });
  const jobRunner = new JobRunner(service, new InMemoryJobStore(), { maxConcurrent: 2 });
  return new DirectBackend(service, jobRunner);
}

if (process.argv[1]?.endsWith("main.js") || process.argv[1]?.endsWith("main.ts")) {
  startMcpServer(buildBackend()).catch((err) => {
    // MCP runs over stdio; log diagnostics to stderr only.
    process.stderr.write(`[showman-mcp] failed to start: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
