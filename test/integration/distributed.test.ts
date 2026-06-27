import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDistributed, LocalObjectStorage, encodeSceneToFile, InMemoryLeaseQueue } from "../../src/index.js";
import type { SceneSpec, ProgressEvent, ShardTask } from "../../src/index.js";

const execFileAsync = promisify(execFile);
async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}
async function frameCount(file: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-count_frames",
    "-show_entries",
    "stream=nb_read_frames",
    "-of",
    "default=nokey=1:noprint_wrappers=1",
    file,
  ]);
  return Number(stdout.trim());
}

function scene(): SceneSpec {
  return {
    specVersion: 1,
    width: 160,
    height: 90,
    fps: 12,
    duration: 2, // 24 frames
    background: "#fdf6e3",
    seed: 5,
    nodes: [
      {
        id: "ball",
        type: "ellipse",
        x: 10,
        y: 30,
        width: 30,
        height: 30,
        fill: "#e63946",
        tracks: [
          {
            property: "x",
            keyframes: [
              { t: 0, value: 10 },
              { t: 2, value: 120, easing: "easeInOutCubic" },
            ],
          },
          {
            property: "fill",
            keyframes: [
              { t: 0, value: "#e63946" },
              { t: 2, value: "#457b9d" },
            ],
          },
        ],
      },
    ],
  };
}

let dataDir: string;
let ffmpeg = false;

beforeAll(async () => {
  ffmpeg = await hasFfmpeg();
  dataDir = mkdtempSync(join(tmpdir(), "showman-dist-"));
});
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("distributed rendering (M3)", () => {
  it("shards a job across workers, assembles one correct video", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const storage = new LocalObjectStorage(join(dataDir, "a"));
    const result = await renderDistributed(
      scene(),
      { shardSize: 7, deterministic: true },
      {
        storage,
        workDir: join(dataDir, "a-work"),
        workers: 4,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.status!.state).toBe("done");
    expect(result.status!.shardsTotal).toBe(Math.ceil(24 / 7)); // 4 shards
    expect(result.status!.shardsDone).toBe(result.status!.shardsTotal);

    const out = join(dataDir, "dist-a.mp4");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(out, await storage.get(result.status!.result!.key));
    expect(await frameCount(out)).toBe(24);
  });

  it("distributed output is BYTE-IDENTICAL to a monolithic render (correctness proof)", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    // Monolithic deterministic encode.
    const mono = join(dataDir, "mono.mp4");
    await encodeSceneToFile(scene(), { outPath: mono, deterministic: true });

    // Distributed deterministic render (different shard sizes must still agree).
    const storage = new LocalObjectStorage(join(dataDir, "b"));
    const result = await renderDistributed(
      scene(),
      { shardSize: 5, deterministic: true },
      {
        storage,
        workDir: join(dataDir, "b-work"),
        workers: 6,
      },
    );
    expect(result.ok).toBe(true);
    const distBytes = await storage.get(result.status!.result!.key);
    expect(Buffer.compare(readFileSync(mono), distBytes)).toBe(0);
  });

  it("retries a failed shard and still produces identical output (idempotent retry)", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    // Reference: clean distributed render.
    const refStorage = new LocalObjectStorage(join(dataDir, "ref"));
    const ref = await renderDistributed(
      scene(),
      { shardSize: 6, deterministic: true },
      {
        storage: refStorage,
        workDir: join(dataDir, "ref-work"),
        workers: 4,
      },
    );
    const refBytes = await refStorage.get(ref.status!.result!.key);

    // Faulted: shard 1 throws on its first attempt; the lease requeues it.
    const faultStorage = new LocalObjectStorage(join(dataDir, "fault"));
    const seenAttempt = new Map<number, number>();
    const result = await renderDistributed(
      scene(),
      { shardSize: 6, deterministic: true },
      {
        storage: faultStorage,
        workDir: join(dataDir, "fault-work"),
        workers: 3,
        queueOptions: { defaultVisibilityMs: 50, maxAttempts: 5 },
        faultInjector: (task: ShardTask, attempt: number) => {
          seenAttempt.set(task.shardId, attempt);
          return task.shardId === 1 && attempt === 1; // fail shard 1 once
        },
      },
    );
    expect(result.ok).toBe(true);
    expect(seenAttempt.get(1)).toBeGreaterThanOrEqual(2); // shard 1 was retried
    const faultBytes = await faultStorage.get(result.status!.result!.key);
    expect(Buffer.compare(refBytes, faultBytes)).toBe(0); // retry produced identical output
  });

  it("emits progress from rendering through done", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const storage = new LocalObjectStorage(join(dataDir, "c"));
    const events: ProgressEvent[] = [];
    const result = await renderDistributed(
      scene(),
      { shardSize: 8, deterministic: true },
      {
        storage,
        workDir: join(dataDir, "c-work"),
        workers: 3,
        onProgress: (e) => events.push(e),
      },
    );
    expect(result.ok).toBe(true);
    const states = new Set(events.map((e) => e.state));
    expect(states.has("rendering")).toBe(true);
    expect(states.has("done")).toBe(true);
    expect(Math.max(...events.map((e) => e.shardsDone))).toBe(result.status!.shardsTotal);
  });

  it("fails the job (not hang) when a shard is poison and dead-letters", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const storage = new LocalObjectStorage(join(dataDir, "poison"));
    const result = await renderDistributed(
      scene(),
      { shardSize: 8, deterministic: true },
      {
        storage,
        workDir: join(dataDir, "poison-work"),
        workers: 2,
        queueOptions: { defaultVisibilityMs: 20, maxAttempts: 2 },
        faultInjector: (task: ShardTask) => task.shardId === 0, // shard 0 ALWAYS fails
      },
      15_000,
    );
    // The fan-in barrier must not hang forever; the job resolves to an error.
    expect(result.status!.state).toBe("error");
    expect(result.ok).toBe(false);
  });

  it("dead-letters a shard that always fails (poison-shard safety)", async () => {
    const queue = new InMemoryLeaseQueue<ShardTask>({ maxAttempts: 2, defaultVisibilityMs: 10 });
    await queue.push({ jobId: "j", shardId: 0, frameStart: 0, frameEnd: 1, specRef: "specs/j.json" });
    // Lease + let it expire twice -> exceeds maxAttempts -> dead-letter.
    await queue.lease(1);
    await new Promise((r) => setTimeout(r, 5));
    await queue.lease(1); // reaps the first expired lease (attempt 2)
    await new Promise((r) => setTimeout(r, 5));
    await queue.size(); // triggers reap of the second expired lease
    expect((await queue.deadLetter()).length).toBe(1);
  });
});
