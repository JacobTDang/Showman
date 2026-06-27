/**
 * M2.2 — Async job lifecycle.
 *
 * Agents submit and get a jobId immediately, then poll status until a resultUrl is
 * ready (async-by-default for agents, per the Communication pillar). The JobStore
 * is an interface so M3 can swap the in-memory store for Postgres-backed shared
 * state without touching the runner.
 */

import { randomUUID } from "node:crypto";
import type { SceneSpec } from "../spec/types.js";
import type { ValidationError } from "../validator/validate.js";
import type { RenderOptions, RenderService } from "./renderService.js";
import type { StoredObject } from "./storage.js";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobProgress {
  framesDone: number;
  totalFrames: number;
}

export interface JobResult {
  video: StoredObject;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationSec: number;
}

export interface Job {
  id: string;
  status: JobStatus;
  spec: SceneSpec;
  options: RenderOptions;
  progress: JobProgress;
  result?: JobResult;
  errors?: ValidationError[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** Public (poll-friendly) view of a job — no spec echo. */
export interface JobView {
  id: string;
  status: JobStatus;
  progress: JobProgress;
  result?: JobResult;
  errors?: ValidationError[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export function toJobView(job: Job): JobView {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    ...(job.result ? { result: job.result } : {}),
    ...(job.errors ? { errors: job.errors } : {}),
    ...(job.error ? { error: job.error } : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export interface JobStore {
  create(job: Job): Promise<void>;
  get(id: string): Promise<Job | null>;
  update(id: string, patch: Partial<Job>): Promise<Job | null>;
  list(): Promise<Job[]>;
}

/** In-memory JobStore for single-node dev/test. M3 swaps in a Postgres-backed store. */
export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, Job>();

  async create(job: Job): Promise<void> {
    this.jobs.set(job.id, job);
  }
  async get(id: string): Promise<Job | null> {
    return this.jobs.get(id) ?? null;
  }
  async update(id: string, patch: Partial<Job>): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job) return null;
    const next = { ...job, ...patch, updatedAt: now() };
    this.jobs.set(id, next);
    return next;
  }
  async list(): Promise<Job[]> {
    return [...this.jobs.values()];
  }
}

function now(): number {
  // Service-layer timestamp (the engine stays clock-free; this is orchestration).
  return Date.now();
}

export interface JobRunnerOptions {
  /** Max jobs processed concurrently on this node. Default 1. */
  maxConcurrent?: number;
}

/**
 * Drives queued jobs to completion using the RenderService. Submission returns
 * immediately; processing happens in the background with a concurrency cap.
 */
export class JobRunner {
  private readonly pending: string[] = [];
  private active = 0;
  private readonly maxConcurrent: number;

  constructor(
    private readonly service: RenderService,
    private readonly store: JobStore,
    options: JobRunnerOptions = {},
  ) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 1);
  }

  /**
   * Validate and enqueue a render. Returns the created job's view, or validation
   * errors (no job created) if the spec is invalid.
   */
  async submit(spec: unknown, options: RenderOptions = {}): Promise<{ ok: true; job: JobView } | { ok: false; errors: ValidationError[] }> {
    const validation = this.service.validate(spec);
    if (!validation.valid) return { ok: false, errors: validation.errors };

    const id = randomUUID();
    const t = now();
    const scene = spec as SceneSpec;
    const job: Job = {
      id,
      status: "queued",
      spec: scene,
      options,
      progress: { framesDone: 0, totalFrames: 0 },
      createdAt: t,
      updatedAt: t,
    };
    await this.store.create(job);
    this.pending.push(id);
    this.drain();
    return { ok: true, job: toJobView(job) };
  }

  async status(id: string): Promise<JobView | null> {
    const job = await this.store.get(id);
    return job ? toJobView(job) : null;
  }

  /** Resolve when the given job reaches a terminal state (test/util convenience). */
  async waitFor(id: string, timeoutMs = 30_000): Promise<JobView | null> {
    const start = now();
    for (;;) {
      const view = await this.status(id);
      if (!view) return null;
      if (view.status === "done" || view.status === "error") return view;
      if (now() - start > timeoutMs) return view;
      await delay(25);
    }
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.pending.length > 0) {
      const id = this.pending.shift()!;
      this.active++;
      void this.process(id).finally(() => {
        this.active--;
        this.drain();
      });
    }
  }

  private async process(id: string): Promise<void> {
    const job = await this.store.get(id);
    if (!job) return;
    await this.store.update(id, { status: "running" });
    try {
      const result = await this.service.render(job.spec, job.options, {
        onProgress: (framesDone, totalFrames) => {
          void this.store.update(id, { progress: { framesDone, totalFrames } });
        },
      });
      if (!result.ok) {
        if ("blocked" in result) {
          await this.store.update(id, {
            status: "error",
            error: `content_safety: ${result.findings.map((f) => `${f.category}:${f.term}`).join(", ")}`,
          });
        } else {
          await this.store.update(id, { status: "error", errors: result.errors, error: "invalid_spec" });
        }
        return;
      }
      await this.store.update(id, {
        status: "done",
        result: {
          video: result.video,
          width: result.width,
          height: result.height,
          fps: result.fps,
          frameCount: result.frameCount,
          durationSec: result.durationSec,
        },
        progress: { framesDone: result.frameCount, totalFrames: result.frameCount },
      });
    } catch (err) {
      await this.store.update(id, { status: "error", error: (err as Error).message });
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
