/**
 * Shard worker (M3): pulls shard tasks from the queue, renders the frame range to
 * a segment in object storage, and reports the result. Stateless and cloneable —
 * the unit of horizontal scale. If it dies mid-render without acking, the lease
 * expires and another worker retries the same shard to identical bytes.
 */

import type { SceneSpec } from "../spec/types.js";
import type { ObjectStorage } from "../service/storage.js";
import type { Queue } from "./queue.js";
import type { ShardResult, ShardTask } from "./messages.js";
import { renderSegment } from "./segment.js";

export interface ShardWorkerOptions {
  id: string;
  queue: Queue<ShardTask>;
  storage: ObjectStorage;
  /** How the worker reports completion (in-process: coordinator.onShardResult; prod: a results queue/pubsub). */
  report: (result: ShardResult) => Promise<void>;
  leaseMs?: number;
  /**
   * Test hook: return true to simulate a crash on this (task, attempt). Lets a test
   * fail a shard's first attempt and prove the retry renders identical bytes.
   */
  faultInjector?: (task: ShardTask, attempt: number) => boolean;
}

export type StepOutcome = "idle" | "ok" | "retry";

export class ShardWorker {
  private readonly id: string;
  private readonly queue: Queue<ShardTask>;
  private readonly storage: ObjectStorage;
  private readonly report: (result: ShardResult) => Promise<void>;
  private readonly leaseMs: number | undefined;
  private readonly faultInjector: ((task: ShardTask, attempt: number) => boolean) | undefined;
  private stopped = false;

  constructor(opts: ShardWorkerOptions) {
    this.id = opts.id;
    this.queue = opts.queue;
    this.storage = opts.storage;
    this.report = opts.report;
    this.leaseMs = opts.leaseMs;
    this.faultInjector = opts.faultInjector;
  }

  /** Process at most one task. Returns whether work was done / retried / idle. */
  async step(): Promise<StepOutcome> {
    const leased = await this.queue.lease(this.leaseMs);
    if (!leased) return "idle";
    const task = leased.payload;
    try {
      if (this.faultInjector?.(task, leased.attempts)) {
        throw new Error(`injected fault on shard ${task.shardId} attempt ${leased.attempts}`);
      }
      const specBytes = await this.storage.get(task.specRef);
      const spec = JSON.parse(specBytes.toString("utf8")) as SceneSpec;
      const { bytes, meta } = renderSegment(spec, task.frameStart, task.frameEnd);
      const segmentKey = `segments/${task.jobId}/${task.shardId}.gz`;
      await this.storage.put(segmentKey, bytes, "application/gzip");
      await this.report({ jobId: task.jobId, shardId: task.shardId, status: "ok", segmentKey, frameCount: meta.frameCount });
      await this.queue.ack(leased.leaseId);
      return "ok";
    } catch {
      // Crash semantics: return the task to the queue for another worker to retry.
      await this.queue.nack(leased.leaseId);
      return "retry";
    }
  }

  /** Run until stopped, pulling tasks as they appear. */
  async run(idlePollMs = 5): Promise<void> {
    this.stopped = false;
    while (!this.stopped) {
      const outcome = await this.step();
      if (outcome === "idle") await delay(idlePollMs);
    }
  }

  stop(): void {
    this.stopped = true;
  }

  get workerId(): string {
    return this.id;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
