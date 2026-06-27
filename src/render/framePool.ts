/**
 * M1.1 — Intra-worker frame pool.
 *
 * Every frame is an independent, deterministic pure function, so frames can be
 * rendered across all CPU cores with no locks. `FramePool` keeps a set of worker
 * threads warm for a single spec and renders frame batches across them, returning
 * RGBA buffers in frame order. If worker threads can't be spawned (some sandboxes),
 * it transparently falls back to sequential in-process rendering — output is
 * identical either way, by construction.
 */

import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { renderFrame } from "../engine/render.js";
import type { SceneSpec } from "../spec/types.js";

export interface RenderedFrame {
  index: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface FramePoolOptions {
  /** Number of worker threads. Defaults to cores-1 (min 1). */
  concurrency?: number;
  /** Force the sequential fallback (used in tests / constrained sandboxes). */
  sequential?: boolean;
}

/** Default worker count: leave one core for the main thread / encoder. */
export function defaultConcurrency(): number {
  return Math.max(1, availableParallelism() - 1);
}

function workerEntry(): { url: URL; execArgv: string[] } {
  const isTs = import.meta.url.endsWith(".ts");
  const url = new URL(`./frameWorker.${isTs ? "ts" : "js"}`, import.meta.url);
  // In dev/test the worker is TypeScript; load the tsx loader inside the worker.
  return { url, execArgv: isTs ? ["--import", "tsx"] : [] };
}

/** Render `indices` sequentially in-process. The correctness baseline. */
export function renderFramesSequential(spec: SceneSpec, indices: number[]): RenderedFrame[] {
  return indices.map((index) => {
    const f = renderFrame(spec, index);
    return { index, width: f.width, height: f.height, pixels: f.pixels };
  });
}

interface DoneMessage {
  type: "done";
  results: Array<{ index: number; width: number; height: number; buffer: ArrayBuffer }>;
}

/**
 * A warm pool of worker threads bound to one spec. Reuse across many `render`
 * calls (e.g. encoding chunk by chunk) so workers are spawned only once.
 */
export class FramePool {
  private workers: Worker[] = [];
  private readonly concurrency: number;
  private readonly sequentialMode: boolean;
  private started = false;

  constructor(
    private readonly spec: SceneSpec,
    options: FramePoolOptions = {},
  ) {
    this.concurrency = Math.max(1, options.concurrency ?? defaultConcurrency());
    this.sequentialMode = options.sequential ?? false;
  }

  /** Spawn the workers (idempotent). On any failure, the pool runs sequentially. */
  async start(): Promise<void> {
    if (this.started || this.sequentialMode) {
      this.started = true;
      return;
    }
    this.started = true;
    try {
      const { url, execArgv } = workerEntry();
      const handles = Array.from({ length: this.concurrency }, () => new Worker(url, { workerData: { spec: this.spec }, execArgv }));
      await Promise.all(
        handles.map(
          (w) =>
            new Promise<void>((resolve, reject) => {
              w.once("message", (m: { type: string }) => (m.type === "ready" ? resolve() : reject(new Error("bad init"))));
              w.once("error", reject);
            }),
        ),
      );
      this.workers = handles;
    } catch {
      await this.terminateWorkers();
      this.workers = []; // fall back to sequential
    }
  }

  /** Render `indices`, returning frames sorted by index. */
  async render(indices: number[]): Promise<RenderedFrame[]> {
    if (!this.started) await this.start();
    if (this.workers.length === 0 || indices.length <= 1) {
      return renderFramesSequential(this.spec, indices);
    }

    const n = Math.min(this.workers.length, indices.length);
    const buckets: number[][] = Array.from({ length: n }, () => []);
    indices.forEach((idx, i) => buckets[i % n]!.push(idx));

    const collected: RenderedFrame[] = [];
    try {
      await Promise.all(
        buckets.map(
          (bucket, i) =>
            new Promise<void>((resolve, reject) => {
              const w = this.workers[i]!;
              const onMessage = (msg: DoneMessage) => {
                if (msg.type !== "done") return;
                w.off("error", onError);
                for (const r of msg.results) {
                  collected.push({ index: r.index, width: r.width, height: r.height, pixels: new Uint8ClampedArray(r.buffer) });
                }
                resolve();
              };
              const onError = (err: Error) => {
                w.off("message", onMessage);
                reject(err);
              };
              w.once("message", onMessage);
              w.once("error", onError);
              w.postMessage({ type: "render", indices: bucket });
            }),
        ),
      );
    } catch {
      return renderFramesSequential(this.spec, indices);
    }
    collected.sort((a, b) => a.index - b.index);
    return collected;
  }

  private async terminateWorkers(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate().catch(() => undefined)));
  }

  /** Terminate all workers. Always call when done. */
  async close(): Promise<void> {
    await this.terminateWorkers();
    this.workers = [];
  }
}

/**
 * Render `indices` across a one-shot worker pool, returning frames sorted by index.
 * Convenience wrapper around {@link FramePool} for callers that render once.
 */
export async function renderFramesParallel(
  spec: SceneSpec,
  indices: number[],
  options: FramePoolOptions = {},
): Promise<RenderedFrame[]> {
  if (options.sequential || indices.length <= 1) {
    return renderFramesSequential(spec, indices);
  }
  const pool = new FramePool(spec, options);
  try {
    await pool.start();
    return await pool.render(indices);
  } finally {
    await pool.close();
  }
}
