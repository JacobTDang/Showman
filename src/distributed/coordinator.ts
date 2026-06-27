/**
 * Coordinator (M3): shards a job's frame range into tasks, enqueues them, tracks
 * shard completion, and — once *all* shards report (the fan-in barrier) —
 * assembles the segments into the final video. Job state lives behind a small
 * interface so a Postgres-backed store drops in for production.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { SceneSpec } from "../spec/types.js";
import { validateScene, type ValidationError } from "../validator/validate.js";
import { totalFrames } from "../spec/schema.js";
import type { ObjectStorage, StoredObject } from "../service/storage.js";
import { moderateScene, type ModerationProvider, type ModerationFinding } from "../safety/moderation.js";
import type { Queue } from "./queue.js";
import type { DistributedRenderOptions, JobState, ProgressEvent, ShardResult, ShardTask } from "./messages.js";
import { assembleSegments, decodeSegment } from "./segment.js";

interface JobRecord {
  jobId: string;
  spec: SceneSpec;
  options: DistributedRenderOptions;
  specRef: string;
  framesTotal: number;
  shardsTotal: number;
  completed: Map<number, { segmentKey: string; frameCount: number }>;
  state: JobState;
  result?: StoredObject;
  error?: string;
  assembling: boolean;
}

export interface JobStatusView {
  jobId: string;
  state: JobState;
  shardsDone: number;
  shardsTotal: number;
  framesTotal: number;
  result?: StoredObject;
  error?: string;
}

export interface CoordinatorOptions {
  queue: Queue<ShardTask>;
  storage: ObjectStorage;
  workDir: string;
  ffmpegPath?: string;
  onProgress?: (event: ProgressEvent) => void;
  /** Content-safety gate (M5.7). If set, unsafe specs are rejected at submit. */
  moderation?: ModerationProvider;
}

const DEFAULT_SHARD_SIZE = 30;

export class Coordinator {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly queue: Queue<ShardTask>;
  private readonly storage: ObjectStorage;
  private readonly workDir: string;
  private readonly ffmpegPath: string | undefined;
  private readonly onProgress: ((event: ProgressEvent) => void) | undefined;
  private readonly moderation: ModerationProvider | undefined;

  constructor(opts: CoordinatorOptions) {
    this.queue = opts.queue;
    this.storage = opts.storage;
    this.workDir = opts.workDir;
    this.ffmpegPath = opts.ffmpegPath;
    this.onProgress = opts.onProgress;
    this.moderation = opts.moderation;
    mkdirSync(this.workDir, { recursive: true });
  }

  /** Validate, gate for safety, shard, and enqueue a job. Returns the jobId, or errors/block. */
  async submit(
    spec: unknown,
    options: DistributedRenderOptions = {},
  ): Promise<
    | { ok: true; jobId: string; shardsTotal: number }
    | { ok: false; errors: ValidationError[] }
    | { ok: false; blocked: "content_safety"; findings: ModerationFinding[] }
  > {
    const validation = validateScene(spec);
    if (!validation.valid) return { ok: false, errors: validation.errors };
    const scene = spec as SceneSpec;

    // Content-safety gate (release blocker) — before any work is enqueued.
    if (this.moderation) {
      const verdict = await moderateScene(scene, this.moderation);
      if (!verdict.safe) return { ok: false, blocked: "content_safety", findings: verdict.findings };
    }

    const jobId = randomUUID();
    const framesTotal = totalFrames(scene.fps, scene.duration);
    const shardSize = Math.max(1, options.shardSize ?? DEFAULT_SHARD_SIZE);
    const shardsTotal = Math.ceil(framesTotal / shardSize);

    // Store the spec so tasks stay small; workers fetch it by reference.
    const specRef = `specs/${jobId}.json`;
    await this.storage.put(specRef, Buffer.from(JSON.stringify(scene)), "application/json");

    const record: JobRecord = {
      jobId,
      spec: scene,
      options,
      specRef,
      framesTotal,
      shardsTotal,
      completed: new Map(),
      state: "rendering",
      assembling: false,
    };
    this.jobs.set(jobId, record);

    for (let shardId = 0; shardId < shardsTotal; shardId++) {
      const frameStart = shardId * shardSize;
      const frameEnd = Math.min(frameStart + shardSize, framesTotal);
      await this.queue.push({ jobId, shardId, frameStart, frameEnd, specRef });
    }
    this.emit(record);
    return { ok: true, jobId, shardsTotal };
  }

  /** Called by a worker when a shard finishes (the fan-in signal). */
  async onShardResult(result: ShardResult): Promise<void> {
    const job = this.jobs.get(result.jobId);
    if (!job || job.state === "done" || job.state === "error") return;
    if (result.status !== "ok" || !result.segmentKey) {
      job.state = "error";
      job.error = result.error ?? "shard failed";
      this.emit(job);
      return;
    }
    if (!job.completed.has(result.shardId)) {
      job.completed.set(result.shardId, { segmentKey: result.segmentKey, frameCount: result.frameCount ?? 0 });
    }
    this.emit(job);

    // Fan-in barrier: only assemble once every shard has reported.
    if (job.completed.size === job.shardsTotal && !job.assembling) {
      job.assembling = true;
      await this.assemble(job);
    }
  }

  /** Count jobs by state (for observability). */
  jobStateCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const job of this.jobs.values()) counts[job.state] = (counts[job.state] ?? 0) + 1;
    return counts;
  }

  status(jobId: string): JobStatusView | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return {
      jobId,
      state: job.state,
      shardsDone: job.completed.size,
      shardsTotal: job.shardsTotal,
      framesTotal: job.framesTotal,
      ...(job.result ? { result: job.result } : {}),
      ...(job.error ? { error: job.error } : {}),
    };
  }

  private async assemble(job: JobRecord): Promise<void> {
    job.state = "assembling";
    this.emit(job);
    const tmp = join(this.workDir, `${job.jobId}.mp4`);
    try {
      await assembleSegments(
        job.shardsTotal,
        async (shardId) => {
          const entry = job.completed.get(shardId);
          if (!entry) throw new Error(`missing segment for shard ${shardId}`);
          return decodeSegment(await this.storage.get(entry.segmentKey));
        },
        tmp,
        {
          width: job.spec.width,
          height: job.spec.height,
          fps: job.spec.fps,
          deterministic: job.options.deterministic ?? false,
          ...(job.options.crf !== undefined ? { crf: job.options.crf } : {}),
          ...(job.options.preset ? { preset: job.options.preset } : {}),
          ...(this.ffmpegPath ? { ffmpegPath: this.ffmpegPath } : {}),
        },
      );
      const bytes = readFileSync(tmp);
      job.result = await this.storage.put(`videos/${job.jobId}.mp4`, bytes, "video/mp4");
      job.state = "done";
      this.emit(job);
    } catch (err) {
      job.state = "error";
      job.error = (err as Error).message;
      this.emit(job);
    } finally {
      rmSync(tmp, { force: true });
    }
  }

  private emit(job: JobRecord): void {
    if (!this.onProgress) return;
    const framesDone = [...job.completed.values()].reduce((n, s) => n + s.frameCount, 0);
    this.onProgress({
      jobId: job.jobId,
      shardsDone: job.completed.size,
      shardsTotal: job.shardsTotal,
      framesDone,
      framesTotal: job.framesTotal,
      state: job.state,
    });
  }
}
