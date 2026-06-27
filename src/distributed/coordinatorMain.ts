/**
 * Coordinator service entry point. Run as its own container in production; the Go
 * gateway proxies submit/status here. Env: PORT, SHOWMAN_DATA_DIR,
 * SHOWMAN_WORKERS.
 */

import { join } from "node:path";
import { LocalObjectStorage } from "../service/storage.js";
import { CoordinatorService, createCoordinatorServer, listenCoordinator } from "./coordinatorService.js";
import { defaultConcurrency } from "../render/framePool.js";
import { RuleBasedModeration } from "../safety/moderation.js";

export async function startCoordinator(): Promise<{ port: number; close: () => Promise<void> }> {
  const dataDir = process.env.SHOWMAN_DATA_DIR ?? join(process.cwd(), "data");
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  const service = new CoordinatorService({
    storage,
    workDir: join(dataDir, "coordinator-tmp"),
    workers: Number(process.env.SHOWMAN_WORKERS ?? defaultConcurrency()),
    moderation: new RuleBasedModeration(),
  });
  const server = createCoordinatorServer(service, storage);
  const port = await listenCoordinator(server, Number(process.env.PORT ?? 8090), "0.0.0.0");
  return {
    port,
    close: async () => {
      await service.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

if (process.argv[1]?.endsWith("coordinatorMain.ts") || process.argv[1]?.endsWith("coordinatorMain.js")) {
  startCoordinator().then(({ port }) => console.log(`[showman] coordinator listening on :${port}`));
}
