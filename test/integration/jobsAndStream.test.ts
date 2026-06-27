import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { RenderService, LocalObjectStorage, createServer, listen, InMemoryJobStore, JobRunner } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";

const execFileAsync = promisify(execFile);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    fps: 10,
    duration: 0.8, // 8 frames
    background: "#fdf6e3",
    nodes: [
      {
        id: "ball",
        type: "ellipse",
        x: 10,
        y: 20,
        width: 30,
        height: 30,
        fill: "#e63946",
        tracks: [{ property: "x", keyframes: [{ t: 0, value: 10 }, { t: 0.8, value: 80 }] }],
      },
    ],
  };
}

let server: Server;
let baseUrl: string;
let dataDir: string;
let ffmpeg = false;

beforeAll(async () => {
  ffmpeg = await hasFfmpeg();
  dataDir = mkdtempSync(join(tmpdir(), "showman-m2-"));
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  const service = new RenderService({ storage, workDir: join(dataDir, "tmp") });
  const jobRunner = new JobRunner(service, new InMemoryJobStore(), { maxConcurrent: 2 });
  server = createServer({ service, storage, jobRunner });
  baseUrl = `http://127.0.0.1:${await listen(server, 0)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

const post = (path: string, payload: unknown) => fetch(`${baseUrl}${path}`, { method: "POST", body: JSON.stringify(payload) });

describe("async jobs (M2.2)", () => {
  it("submit -> poll -> resultUrl", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const submit = await post("/jobs", { spec: scene(), options: { deterministic: true } });
    expect(submit.status).toBe(202);
    const { jobId, status, statusUrl } = await body(submit);
    expect(jobId).toBeTruthy();
    expect(status).toBe("queued");
    expect(statusUrl).toBe(`/jobs/${jobId}`);

    // Poll to completion.
    let view: { status: string; result?: { video: { key: string }; frameCount: number } } | undefined;
    for (let i = 0; i < 200; i++) {
      view = await body(await fetch(`${baseUrl}/jobs/${jobId}`));
      if (view!.status === "done" || view!.status === "error") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(view!.status).toBe("done");
    expect(view!.result!.frameCount).toBe(8);

    // The resulting video is fetchable.
    const obj = await fetch(`${baseUrl}/objects/${view!.result!.video.key}`);
    expect(obj.headers.get("content-type")).toBe("video/mp4");
  });

  it("rejects an invalid spec at submit with no job created", async () => {
    const r = await post("/jobs", { spec: { specVersion: 1, nodes: [{ id: "x", type: "blob" }] } });
    expect(r.status).toBe(400);
    expect((await body(r)).errors.length).toBeGreaterThan(0);
  });

  it("unknown job id 404s", async () => {
    const r = await fetch(`${baseUrl}/jobs/does-not-exist`);
    expect(r.status).toBe(404);
  });
});

describe("streaming (M2.1)", () => {
  it("streams a fragmented mp4 whose body is a playable video", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const r = await post("/render/stream", { spec: scene() });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("video/mp4");
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    // ISO-BMFF: an 'ftyp' box appears at the start of the (fragmented) stream.
    expect(bytes.subarray(4, 8).toString("latin1")).toBe("ftyp");
  });

  it("returns 400 for an invalid spec before streaming", async () => {
    const r = await post("/render/stream", { spec: { specVersion: 1 } });
    expect(r.status).toBe(400);
  });
});
