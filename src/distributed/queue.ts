/**
 * Work-stealing task queue with leases (M3).
 *
 * Workers PULL tasks (natural load distribution — a free worker grabs the next
 * task). A pulled task is *leased*, not removed: if its lease expires before the
 * worker acks (the worker died mid-render), the task is requeued and another
 * worker retries it. Because rendering is deterministic, a retried shard produces
 * identical bytes — retry is safe by construction. After `maxAttempts` the task is
 * dead-lettered (M6's poison-shard handling).
 *
 * The interface is small so a Redis-backed implementation (BRPOP + a sorted-set of
 * leases) drops in for production without touching the coordinator or workers.
 */

export interface LeasedMessage<T> {
  /** Lease id used to ack/nack. */
  leaseId: string;
  payload: T;
  /** 1 on first delivery, incremented on each redelivery. */
  attempts: number;
}

export interface Queue<T> {
  push(payload: T): Promise<void>;
  /** Lease the next available task, or null if none. Reaps expired leases first. */
  lease(visibilityMs?: number): Promise<LeasedMessage<T> | null>;
  ack(leaseId: string): Promise<void>;
  /** Return a leased task to the queue immediately (explicit retry / give-up). */
  nack(leaseId: string): Promise<void>;
  /** Pending (un-leased) task count. */
  size(): Promise<number>;
  /** Currently-leased (in-flight) task count. */
  inflight(): Promise<number>;
  deadLetter(): Promise<T[]>;
}

interface Entry<T> {
  id: string;
  payload: T;
  attempts: number;
}

interface Lease<T> {
  entry: Entry<T>;
  deadline: number;
}

export interface InMemoryQueueOptions {
  defaultVisibilityMs?: number;
  maxAttempts?: number;
  /** Injectable clock for deterministic tests; defaults to Date.now. */
  now?: () => number;
}

export class InMemoryLeaseQueue<T> implements Queue<T> {
  private pending: Entry<T>[] = [];
  private readonly leases = new Map<string, Lease<T>>();
  private readonly dead: T[] = [];
  private seq = 0;
  private readonly defaultVisibilityMs: number;
  private readonly maxAttempts: number;
  private readonly now: () => number;

  constructor(options: InMemoryQueueOptions = {}) {
    this.defaultVisibilityMs = options.defaultVisibilityMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.now = options.now ?? (() => Date.now());
  }

  async push(payload: T): Promise<void> {
    this.pending.push({ id: `t${++this.seq}`, payload, attempts: 0 });
  }

  async lease(visibilityMs?: number): Promise<LeasedMessage<T> | null> {
    this.reap();
    const entry = this.pending.shift();
    if (!entry) return null;
    entry.attempts += 1;
    const leaseId = `l${++this.seq}`;
    this.leases.set(leaseId, { entry, deadline: this.now() + (visibilityMs ?? this.defaultVisibilityMs) });
    return { leaseId, payload: entry.payload, attempts: entry.attempts };
  }

  async ack(leaseId: string): Promise<void> {
    this.leases.delete(leaseId);
  }

  async nack(leaseId: string): Promise<void> {
    const lease = this.leases.get(leaseId);
    if (!lease) return;
    this.leases.delete(leaseId);
    this.requeue(lease.entry);
  }

  async size(): Promise<number> {
    this.reap();
    return this.pending.length;
  }

  async inflight(): Promise<number> {
    this.reap();
    return this.leases.size;
  }

  async deadLetter(): Promise<T[]> {
    return [...this.dead];
  }

  /** Requeue leases whose deadline has passed (a worker that never acked). */
  private reap(): void {
    const t = this.now();
    for (const [leaseId, lease] of this.leases) {
      if (lease.deadline <= t) {
        this.leases.delete(leaseId);
        this.requeue(lease.entry);
      }
    }
  }

  private requeue(entry: Entry<T>): void {
    if (entry.attempts >= this.maxAttempts) {
      this.dead.push(entry.payload);
    } else {
      this.pending.push(entry);
    }
  }
}
