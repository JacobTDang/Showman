/**
 * JSON message contracts for distributed rendering (M3.1). These are the only
 * things the coordinator, queue, and workers share — they meet at JSON seams, no
 * shared logic.
 */

export interface ShardTask {
  jobId: string;
  shardId: number;
  /** Inclusive first frame of this shard's range. */
  frameStart: number;
  /** Exclusive end frame. The shard renders [frameStart, frameEnd). */
  frameEnd: number;
  /** Storage key of the job's spec JSON (workers fetch it; tasks stay small). */
  specRef: string;
}

export interface ShardResult {
  jobId: string;
  shardId: number;
  status: "ok" | "error";
  /** Storage key of the rendered segment (gzipped raw frames), when ok. */
  segmentKey?: string;
  frameCount?: number;
  error?: string;
}

export interface ProgressEvent {
  jobId: string;
  shardsDone: number;
  shardsTotal: number;
  framesDone: number;
  framesTotal: number;
  state: JobState;
}

export type JobState = "queued" | "rendering" | "assembling" | "done" | "error";

export interface DistributedRenderOptions {
  /** Frames per shard. Default 30. Smaller = finer-grained load balancing. */
  shardSize?: number;
  deterministic?: boolean;
  crf?: number;
  preset?: string;
}
