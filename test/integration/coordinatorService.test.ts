import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import {
  CoordinatorService,
  createCoordinatorServer,
  listenCoordinator,
  LocalObjectStorage,
  RuleBasedModeration,
} from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";

const execFileAsync = promisify(execFile);

async function body(r: Response): Promise<any> {
  return r.json();
}
async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}
function scene(): SceneSpec {
  return {
    specVersion: 1,
    width: 128,
    height: 72,
    fps: 12,
    duration: 1.5, // 18 frames
    background: "#fdf6e3",
    nodes: [
      {
        id: "r",
        type: "rect",
        x: 10,
        y: 10,
        width: 30,
        height: 30,
        fill: "#1d6f72",
        tracks: [
          {
            property: "rotation",
            keyframes: [
              { t: 0, value: 0 },
              { t: 1.5, value: 180 },
            ],
          },
        ],
      },
    ],
  };
}

let server: Server;
let service: CoordinatorService;
let baseUrl: string;
let dataDir: string;
let ffmpeg = false;

beforeAll(async () => {
  ffmpeg = await hasFfmpeg();
  dataDir = mkdtempSync(join(tmpdir(), "showman-coord-"));
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  service = new CoordinatorService({ storage, workDir: join(dataDir, "work"), workers: 4, moderation: new RuleBasedModeration() });
  server = createCoordinatorServer(service, storage);
  baseUrl = `http://127.0.0.1:${await listenCoordinator(server, 0)}`;
});

afterAll(async () => {
  await service.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

describe("coordinator service over HTTP (M3.3)", () => {
  it("submit -> poll -> sharded render -> fetchable video", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const submit = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      body: JSON.stringify({ spec: scene(), options: { shardSize: 5, deterministic: true } }),
    });
    expect(submit.status).toBe(202);
    const { jobId, shardsTotal } = await body(submit);
    expect(shardsTotal).toBe(Math.ceil(18 / 5)); // 4 shards

    let status: { state: string; result?: { key: string } } | undefined;
    for (let i = 0; i < 400; i++) {
      status = await body(await fetch(`${baseUrl}/jobs/${jobId}`));
      if (status!.state === "done" || status!.state === "error") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(status!.state).toBe("done");

    const obj = await fetch(`${baseUrl}/objects/${status!.result!.key}`);
    expect(obj.headers.get("content-type")).toBe("video/mp4");
    const mp4 = Buffer.from(await obj.arrayBuffer());
    expect(mp4.subarray(4, 8).toString("latin1")).toBe("ftyp");
  });

  it("rejects an invalid spec with 400", async () => {
    const r = await fetch(`${baseUrl}/jobs`, { method: "POST", body: JSON.stringify({ spec: { specVersion: 1, nodes: "nope" } }) });
    expect(r.status).toBe(400);
  });

  it("blocks an unsafe spec at the coordinator's safety gate (no shards enqueued)", async () => {
    const unsafe: SceneSpec = {
      specVersion: 1,
      width: 64,
      height: 64,
      fps: 5,
      duration: 1,
      background: "#fff",
      nodes: [{ id: "t", type: "text", x: 5, y: 30, text: "shoot the gun", fontSize: 14, fill: "#000" }],
    };
    const r = await fetch(`${baseUrl}/jobs`, { method: "POST", body: JSON.stringify({ spec: unsafe }) });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toBe("content_safety");
  });

  it("exposes Prometheus metrics (queue depth, workers, jobs by state)", async () => {
    const r = await fetch(`${baseUrl}/metrics`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/plain");
    const text = await r.text();
    expect(text).toContain("showman_coordinator_queue_pending");
    expect(text).toContain("showman_coordinator_workers 4");
  });
});
