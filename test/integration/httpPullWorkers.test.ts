import { hasFfmpeg } from "../helpers.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { CoordinatorService, createCoordinatorServer, listenCoordinator, LocalObjectStorage, createRemoteWorker } from "../../src/index.js";
import type { SceneSpec, ShardWorker } from "../../src/index.js";

async function body(r: Response): Promise<any> {
  return r.json();
}
function scene(): SceneSpec {
  return {
    specVersion: 1,
    width: 128,
    height: 72,
    fps: 10,
    duration: 1.6,
    background: "#fdf6e3",
    seed: 2,
    nodes: [
      {
        id: "b",
        type: "ellipse",
        x: 10,
        y: 20,
        width: 28,
        height: 28,
        fill: "#e63946",
        tracks: [
          {
            property: "x",
            keyframes: [
              { t: 0, value: 10 },
              { t: 1.6, value: 90 },
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
let workers: ShardWorker[] = [];
let ffmpeg = false;

beforeAll(async () => {
  ffmpeg = await hasFfmpeg();
  dataDir = mkdtempSync(join(tmpdir(), "showman-pull-"));
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  // workers: 0 — the coordinator does NO rendering itself; only external workers do.
  service = new CoordinatorService({ storage, workDir: join(dataDir, "work"), workers: 0 });
  server = createCoordinatorServer(service, storage);
  baseUrl = `http://127.0.0.1:${await listenCoordinator(server, 0)}`;

  // Three separate HTTP-pull workers sharing the same storage dir.
  workers = [0, 1, 2].map((i) => createRemoteWorker(baseUrl, dataDir, `remote-${i}`));
  for (const w of workers) void w.run();
});

afterAll(async () => {
  for (const w of workers) w.stop();
  await service.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

describe("horizontal scale: HTTP-pull workers (no Redis)", () => {
  it("a coordinator with zero internal workers gets its job rendered by external pull workers", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const submit = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      body: JSON.stringify({ spec: scene(), options: { shardSize: 4, deterministic: true } }),
    });
    expect(submit.status).toBe(202);
    const { jobId, shardsTotal } = await body(submit);
    expect(shardsTotal).toBe(Math.ceil(16 / 4)); // 4 shards

    let status: { state: string; result?: { key: string } } | undefined;
    for (let i = 0; i < 600; i++) {
      status = await body(await fetch(`${baseUrl}/jobs/${jobId}`));
      if (status!.state === "done" || status!.state === "error") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(status!.state).toBe("done"); // rendered entirely by the remote pull workers

    const obj = await fetch(`${baseUrl}/objects/${status!.result!.key}`);
    expect(obj.headers.get("content-type")).toBe("video/mp4");
    const mp4 = Buffer.from(await obj.arrayBuffer());
    expect(mp4.subarray(4, 8).toString("latin1")).toBe("ftyp");
  });
});
