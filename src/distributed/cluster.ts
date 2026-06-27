/**
 * In-process cluster driver (M3): wires a queue + coordinator + N shard workers and
 * runs a job to completion. This is the single-box realization of the distributed
 * design — the same Coordinator/Worker/Queue objects run as separate processes in
 * production sharing Redis (queue) + Postgres (state) + object storage. It also
 * backs the coordinator HTTP service the Go gateway fronts.
 */

import type { ObjectStorage } from "../service/storage.js";
import type { ValidationError } from "../validator/validate.js";
import { Coordinator, type JobStatusView } from "./coordinator.js";
import { ShardWorker } from "./shardWorker.js";
import { InMemoryLeaseQueue, type InMemoryQueueOptions } from "./queue.js";
import type { DistributedRenderOptions, ProgressEvent, ShardTask } from "./messages.js";

export interface ClusterOptions {
  storage: ObjectStorage;
  workDir: string;
  /** Number of shard workers. Default 4. */
  workers?: number;
  ffmpegPath?: string;
  queueOptions?: InMemoryQueueOptions;
  onProgress?: (event: ProgressEvent) => void;
  /** Test hook forwarded to workers to simulate crashes. */
  faultInjector?: (task: ShardTask, attempt: number) => boolean;
}

export interface DistributedResult {
  ok: boolean;
  jobId?: string;
  status?: JobStatusView;
  errors?: ValidationError[];
}

/**
 * Submit `spec` to a fresh in-process cluster, run `workers` shard workers against
 * it, and resolve when the job reaches a terminal state.
 */
export async function renderDistributed(
  spec: unknown,
  options: DistributedRenderOptions,
  deps: ClusterOptions,
  timeoutMs = 60_000,
): Promise<DistributedResult> {
  const queue = new InMemoryLeaseQueue<ShardTask>(deps.queueOptions);
  const coordinator = new Coordinator({
    queue,
    storage: deps.storage,
    workDir: deps.workDir,
    ...(deps.ffmpegPath ? { ffmpegPath: deps.ffmpegPath } : {}),
    ...(deps.onProgress ? { onProgress: deps.onProgress } : {}),
  });

  const submitted = await coordinator.submit(spec, options);
  if (!submitted.ok) return { ok: false, ...("errors" in submitted ? { errors: submitted.errors } : {}) };
  const { jobId } = submitted;

  const workerCount = Math.max(1, deps.workers ?? 4);
  const workers = Array.from({ length: workerCount }, (_, i) =>
    new ShardWorker({
      id: `w${i}`,
      queue,
      storage: deps.storage,
      report: (r) => coordinator.onShardResult(r),
      ...(deps.faultInjector ? { faultInjector: deps.faultInjector } : {}),
    }),
  );
  const running = workers.map((w) => w.run());

  const start = Date.now();
  let status = coordinator.status(jobId)!;
  while (status.state !== "done" && status.state !== "error") {
    if (Date.now() - start > timeoutMs) {
      status = { ...status, state: "error", error: "cluster timeout" };
      break;
    }
    await delay(10);
    status = coordinator.status(jobId)!;
  }

  for (const w of workers) w.stop();
  await Promise.allSettled(running);

  return { ok: status.state === "done", jobId, status };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
