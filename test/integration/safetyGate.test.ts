import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import {
  RenderService,
  LocalObjectStorage,
  createServer,
  listen,
  InMemoryJobStore,
  JobRunner,
  RuleBasedModeration,
  SilentTtsProvider,
} from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";

async function body(r: Response): Promise<any> {
  return r.json();
}
const unsafeScene = (): SceneSpec => ({
  specVersion: 1,
  width: 64,
  height: 64,
  fps: 5,
  duration: 0.4,
  background: "#fff",
  nodes: [{ id: "t", type: "text", x: 4, y: 30, text: "shoot the gun and kill", fontSize: 12, fill: "#000" }],
});
const safeScene = (): SceneSpec => ({
  specVersion: 1,
  width: 64,
  height: 64,
  fps: 5,
  duration: 0.4,
  background: "#fff",
  nodes: [{ id: "t", type: "text", x: 4, y: 30, text: "the quick brown fox", fontSize: 12, fill: "#000" }],
});

let server: Server;
let baseUrl: string;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "showman-safety-"));
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  const service = new RenderService({
    storage,
    workDir: join(dataDir, "tmp"),
    tts: new SilentTtsProvider(),
    moderation: new RuleBasedModeration(),
  });
  const jobRunner = new JobRunner(service, new InMemoryJobStore(), { maxConcurrent: 1 });
  server = createServer({ service, storage, jobRunner });
  baseUrl = `http://127.0.0.1:${await listen(server, 0)}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});
const post = (p: string, payload: unknown) => fetch(`${baseUrl}${p}`, { method: "POST", body: JSON.stringify(payload) });

describe("content-safety gate cannot be bypassed (post-review hardening)", () => {
  it("lets SAFE content through /preview (the gate isn't simply rejecting everything)", async () => {
    const r = await post("/preview", { spec: safeScene() });
    // Without this positive case, a moderation that blocked EVERYTHING would pass every other test here.
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("image/png");
  });

  it("blocks /render", async () => {
    expect((await post("/render", { spec: unsafeScene() })).status).toBe(422);
  });

  it("blocks /render even when the client sends options.moderate:false (opt-out stripped)", async () => {
    const r = await post("/render", { spec: unsafeScene(), options: { moderate: false } });
    expect(r.status).toBe(422);
    expect((await body(r)).error).toBe("content_safety");
  });

  it("blocks /preview", async () => {
    expect((await post("/preview", { spec: unsafeScene() })).status).toBe(422);
  });

  it("blocks /render/stream before any bytes are written", async () => {
    expect((await post("/render/stream", { spec: unsafeScene() })).status).toBe(422);
  });

  it("an unsafe /jobs submission ends in error (not a rendered video), even with moderate:false", async () => {
    const submit = await post("/jobs", { spec: unsafeScene(), options: { moderate: false } });
    expect(submit.status).toBe(202);
    const { jobId } = await body(submit);
    let view: { status: string; error?: string } | undefined;
    for (let i = 0; i < 100; i++) {
      view = await body(await fetch(`${baseUrl}/jobs/${jobId}`));
      if (view!.status === "done" || view!.status === "error") break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(view!.status).toBe("error");
    expect(view!.error).toContain("content_safety");
  });
});
