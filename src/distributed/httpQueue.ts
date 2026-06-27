/**
 * HTTP-pull task source for remote shard workers (horizontal scale without Redis).
 *
 * A standalone worker process leases shard tasks from the coordinator over HTTP,
 * renders the segment to shared object storage, and reports the result back. This
 * realizes the plan's work-stealing PULL model across separate containers using only
 * HTTP + shared storage. (A Redis-backed Queue is the alternative for very large
 * fleets; both satisfy the same Queue interface.)
 */

import type { Queue, LeasedMessage } from "./queue.js";
import type { ShardResult, ShardTask } from "./messages.js";

/** Implements the lease/ack/nack a ShardWorker needs by calling a coordinator's /tasks API. */
export class HttpTaskQueue implements Queue<ShardTask> {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(p: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${p}`;
  }

  async lease(visibilityMs?: number): Promise<LeasedMessage<ShardTask> | null> {
    const r = await this.fetchImpl(this.url("/tasks/lease"), {
      method: "POST",
      body: JSON.stringify(visibilityMs !== undefined ? { visibilityMs } : {}),
    });
    if (r.status === 204) return null;
    return (await r.json()) as LeasedMessage<ShardTask>;
  }
  async ack(leaseId: string): Promise<void> {
    await this.fetchImpl(this.url("/tasks/ack"), { method: "POST", body: JSON.stringify({ leaseId }) });
  }
  async nack(leaseId: string): Promise<void> {
    await this.fetchImpl(this.url("/tasks/nack"), { method: "POST", body: JSON.stringify({ leaseId }) });
  }
  async report(result: ShardResult): Promise<void> {
    await this.fetchImpl(this.url("/tasks/result"), { method: "POST", body: JSON.stringify(result) });
  }

  // Producer/admin operations live on the coordinator, not the worker.
  async push(): Promise<void> {
    throw new Error("HttpTaskQueue is pull-only; producers enqueue at the coordinator");
  }
  async size(): Promise<number> {
    return 0;
  }
  async inflight(): Promise<number> {
    return 0;
  }
  async deadLetter(): Promise<ShardTask[]> {
    return [];
  }
  onDeadLetter(): void {
    /* dead-lettering is handled at the coordinator */
  }
}
