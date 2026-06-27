/**
 * Standalone remote shard-worker process. Pulls shard tasks from a coordinator over
 * HTTP, renders segments to shared object storage, and reports results — the
 * horizontally-scalable worker container (run as many as you like).
 *
 * Env: SHOWMAN_COORDINATOR_URL, SHOWMAN_DATA_DIR (shared with the coordinator),
 * SHOWMAN_WORKER_ID.
 */

import { join } from "node:path";
import { LocalObjectStorage } from "../service/storage.js";
import { ShardWorker } from "./shardWorker.js";
import { HttpTaskQueue } from "./httpQueue.js";

export function createRemoteWorker(coordinatorUrl: string, dataDir: string, id: string, fetchImpl: typeof fetch = fetch): ShardWorker {
  const queue = new HttpTaskQueue(coordinatorUrl, fetchImpl);
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  return new ShardWorker({
    id,
    queue,
    storage,
    report: (result) => queue.report(result),
  });
}

export async function startRemoteWorker(): Promise<ShardWorker> {
  const coordinatorUrl = process.env.SHOWMAN_COORDINATOR_URL ?? "http://coordinator:8090";
  const dataDir = process.env.SHOWMAN_DATA_DIR ?? join(process.cwd(), "data");
  const id = process.env.SHOWMAN_WORKER_ID ?? `remote-${process.pid}`;
  const worker = createRemoteWorker(coordinatorUrl, dataDir, id);
  void worker.run();
  return worker;
}

if (process.argv[1]?.endsWith("remoteWorkerMain.ts") || process.argv[1]?.endsWith("remoteWorkerMain.js")) {
  startRemoteWorker().then((w) => console.log(`[showman] remote shard worker ${w.workerId} pulling from coordinator`));
}
