/**
 * Long-lived coordinator service (M3.3): a persistent Coordinator plus a warm pool
 * of shard workers, fronted by HTTP. Submit returns a jobId immediately; poll
 * status; fetch the result object. This is the backend the Go gateway proxies to.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { Coordinator } from "./coordinator.js";
import { ShardWorker } from "./shardWorker.js";
import { InMemoryLeaseQueue } from "./queue.js";
import type { DistributedRenderOptions, ProgressEvent, ShardResult, ShardTask } from "./messages.js";
import type { LeasedMessage } from "./queue.js";
import type { ObjectStorage } from "../service/storage.js";
import { guessContentType } from "../service/storage.js";

import type { ModerationProvider } from "../safety/moderation.js";

export interface CoordinatorServiceOptions {
  storage: ObjectStorage;
  workDir: string;
  /** Internal in-process shard workers. Set to 0 to serve only external HTTP-pull workers. */
  workers?: number;
  ffmpegPath?: string;
  moderation?: ModerationProvider;
  /** Provide a custom queue (e.g. a Redis-backed one). Defaults to in-memory. */
  queue?: InMemoryLeaseQueue<ShardTask>;
}

/** A persistent coordinator + continuously-running shard workers. */
export class CoordinatorService {
  readonly coordinator: Coordinator;
  private readonly queue: InMemoryLeaseQueue<ShardTask>;
  private readonly workers: ShardWorker[];
  private running: Promise<void>[] = [];
  private readonly lastProgress = new Map<string, ProgressEvent>();

  constructor(opts: CoordinatorServiceOptions) {
    this.queue = opts.queue ?? new InMemoryLeaseQueue<ShardTask>();
    this.coordinator = new Coordinator({
      queue: this.queue,
      storage: opts.storage,
      workDir: opts.workDir,
      ...(opts.ffmpegPath ? { ffmpegPath: opts.ffmpegPath } : {}),
      ...(opts.moderation ? { moderation: opts.moderation } : {}),
      onProgress: (e) => this.lastProgress.set(e.jobId, e),
    });
    this.queue.onDeadLetter((task) => this.coordinator.failJob(task.jobId, `shard ${task.shardId} exceeded retries (poison shard)`));

    const n = Math.max(0, opts.workers ?? 4);
    this.workers = Array.from(
      { length: n },
      (_, i) =>
        new ShardWorker({
          id: `w${i}`,
          queue: this.queue,
          storage: opts.storage,
          report: (r) => this.coordinator.onShardResult(r),
        }),
    );
  }

  start(): void {
    if (this.running.length === 0) this.running = this.workers.map((w) => w.run());
  }

  async stop(): Promise<void> {
    for (const w of this.workers) w.stop();
    await Promise.allSettled(this.running);
    this.running = [];
  }

  submit(spec: unknown, options: DistributedRenderOptions) {
    return this.coordinator.submit(spec, options);
  }

  status(jobId: string) {
    return this.coordinator.status(jobId);
  }

  progress(jobId: string): ProgressEvent | undefined {
    return this.lastProgress.get(jobId);
  }

  // --- Task broker: lets external HTTP-pull workers share this coordinator's queue ---
  leaseTask(visibilityMs?: number): Promise<LeasedMessage<ShardTask> | null> {
    return this.queue.lease(visibilityMs);
  }
  ackTask(leaseId: string): Promise<void> {
    return this.queue.ack(leaseId);
  }
  nackTask(leaseId: string): Promise<void> {
    return this.queue.nack(leaseId);
  }
  reportResult(result: ShardResult): Promise<void> {
    return this.coordinator.onShardResult(result);
  }

  /** Observability snapshot: queue depth, in-flight, dead-letters, jobs by state. */
  async metrics(): Promise<Record<string, number>> {
    const states = this.coordinator.jobStateCounts();
    const out: Record<string, number> = {
      queue_pending: await this.queue.size(),
      queue_inflight: await this.queue.inflight(),
      queue_dead_letter: (await this.queue.deadLetter()).length,
      workers: this.workers.length,
    };
    for (const [state, n] of Object.entries(states)) out[`jobs_${state}`] = n;
    return out;
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readJson(req: http.IncomingMessage, limit = 8 * 1024 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      try {
        resolve(buf.length ? JSON.parse(buf.toString("utf8")) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** HTTP server for the coordinator: POST /jobs, GET /jobs/:id, GET /objects/<key>, GET /healthz. */
export function createCoordinatorServer(service: CoordinatorService, storage: ObjectStorage): http.Server {
  service.start();
  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      const method = req.method ?? "GET";

      if (method === "GET" && path === "/healthz") return sendJson(res, 200, { ok: true });

      if (method === "GET" && path === "/metrics") {
        const m = await service.metrics();
        const lines = Object.entries(m).map(([k, v]) => `showman_coordinator_${k} ${v}`);
        res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
        return void res.end(lines.join("\n") + "\n");
      }

      if (method === "POST" && path === "/jobs") {
        const b = (await readJson(req)) as { spec?: unknown; options?: DistributedRenderOptions };
        const submitted = await service.submit(b?.spec ?? b, b?.options ?? {});
        if (!submitted.ok) {
          if ("blocked" in submitted) return sendJson(res, 422, { error: "content_safety", findings: submitted.findings });
          return sendJson(res, 400, { error: "invalid_spec", errors: submitted.errors });
        }
        return sendJson(res, 202, { jobId: submitted.jobId, shardsTotal: submitted.shardsTotal, statusUrl: `/jobs/${submitted.jobId}` });
      }

      if (method === "GET" && path.startsWith("/jobs/")) {
        const id = decodeURIComponent(path.slice("/jobs/".length));
        const status = service.status(id);
        if (!status) return sendJson(res, 404, { error: "not_found", id });
        return sendJson(res, 200, status);
      }

      // Task broker for external HTTP-pull shard workers.
      if (method === "POST" && path === "/tasks/lease") {
        const b = (await readJson(req)) as { visibilityMs?: number };
        const leased = await service.leaseTask(b?.visibilityMs);
        if (!leased) return void res.writeHead(204).end();
        return sendJson(res, 200, leased);
      }
      if (method === "POST" && path === "/tasks/ack") {
        const b = (await readJson(req)) as { leaseId?: string };
        await service.ackTask(String(b?.leaseId));
        return sendJson(res, 200, { ok: true });
      }
      if (method === "POST" && path === "/tasks/nack") {
        const b = (await readJson(req)) as { leaseId?: string };
        await service.nackTask(String(b?.leaseId));
        return sendJson(res, 200, { ok: true });
      }
      if (method === "POST" && path === "/tasks/result") {
        const b = (await readJson(req)) as ShardResult;
        await service.reportResult(b);
        return sendJson(res, 200, { ok: true });
      }

      if (method === "GET" && path.startsWith("/objects/")) {
        const key = decodeURIComponent(path.slice("/objects/".length));
        const stat = await storage.stat(key);
        if (!stat) return sendJson(res, 404, { error: "not_found", key });
        res.writeHead(200, { "content-type": guessContentType(key), "content-length": stat.size });
        if (storage.openRead) return void storage.openRead(key).pipe(res);
        return void res.end(await storage.get(key));
      }

      sendJson(res, 404, { error: "not_found", path });
    })().catch((err) => {
      if (!res.headersSent) sendJson(res, 500, { error: "internal", message: (err as Error).message });
      else res.end();
    });
  });
}

/** Start the coordinator server on `port` (0 = ephemeral). Resolves with the bound port. */
export function listenCoordinator(server: http.Server, port = 0, host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve) => server.listen(port, host, () => resolve((server.address() as AddressInfo).port)));
}
