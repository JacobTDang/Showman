import { hasFfmpeg } from "../helpers.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import {
  RenderService,
  LocalObjectStorage,
  InMemoryJobStore,
  JobRunner,
  createServer,
  listen,
  DirectBackend,
  AuthoringAgent,
  TemplateAuthor,
  SilentTtsProvider,
  RuleBasedModeration,
} from "../../src/index.js";

async function body(r: Response): Promise<any> {
  return r.json();
}

let server: Server;
let baseUrl: string;
let dataDir: string;
let ffmpeg = false;

beforeAll(async () => {
  ffmpeg = await hasFfmpeg();
  dataDir = mkdtempSync(join(tmpdir(), "showman-brief-"));
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  const service = new RenderService({
    storage,
    workDir: join(dataDir, "tmp"),
    tts: new SilentTtsProvider(),
    moderation: new RuleBasedModeration(),
  });
  const jobRunner = new JobRunner(service, new InMemoryJobStore(), { maxConcurrent: 1 });
  // Small canvas keeps the test fast; the offline template author needs no API key.
  const author = new TemplateAuthor({ width: 320, height: 180, fps: 8 });
  const authoringAgent = new AuthoringAgent(new DirectBackend(service, jobRunner), author, { maxAttempts: 2 });
  server = createServer({ service, storage, jobRunner, authoringAgent });
  baseUrl = `http://127.0.0.1:${await listen(server, 0)}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

describe("brief -> finished video, end to end (the product goal)", () => {
  it("POST /author with a plain-English brief returns a job that renders to a fetchable video", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const authored = await fetch(`${baseUrl}/author`, {
      method: "POST",
      body: JSON.stringify({ brief: "teach counting to three with stars" }),
    });
    expect(authored.status).toBe(202);
    const { jobId, statusUrl } = await body(authored);
    expect(jobId).toBeTruthy();
    expect(statusUrl).toBe(`/jobs/${jobId}`);

    let view: { status: string; result?: { video: { key: string }; durationSec: number } } | undefined;
    for (let i = 0; i < 300; i++) {
      view = await body(await fetch(`${baseUrl}/jobs/${jobId}`));
      if (view!.status === "done" || view!.status === "error") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(view!.status).toBe("done");

    const obj = await fetch(`${baseUrl}/objects/${view!.result!.video.key}`);
    expect(obj.headers.get("content-type")).toBe("video/mp4");
    const mp4 = Buffer.from(await obj.arrayBuffer());
    expect(mp4.subarray(4, 8).toString("latin1")).toBe("ftyp");
  });

  it("rejects an empty brief", async () => {
    const r = await fetch(`${baseUrl}/author`, { method: "POST", body: JSON.stringify({ brief: "  " }) });
    expect(r.status).toBe(400);
  });

  it("POST /v1/generate returns a finished MP4 in ONE synchronous call (the atomic agent tool)", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const r = await fetch(`${baseUrl}/v1/generate`, {
      method: "POST",
      body: JSON.stringify({ brief: "teach counting to three with stars" }),
    });
    expect(r.status).toBe(200); // synchronous — no 202, no jobId, no polling
    const out = await body(r);
    expect(out.videoUrl).toBeTruthy();
    expect(out.video.key).toBeTruthy();
    expect(out.durationSec).toBeGreaterThan(0);
    expect(out.attempts).toBeGreaterThanOrEqual(1);
    // The returned reference fetches a real MP4 (ftyp box).
    const obj = await fetch(`${baseUrl}/objects/${out.video.key}`);
    expect(obj.headers.get("content-type")).toBe("video/mp4");
    const mp4 = Buffer.from(await obj.arrayBuffer());
    expect(mp4.subarray(4, 8).toString("latin1")).toBe("ftyp");
  });

  it("POST /v1/generate rejects an empty brief", async () => {
    const r = await fetch(`${baseUrl}/v1/generate`, { method: "POST", body: JSON.stringify({ brief: "" }) });
    expect(r.status).toBe(400);
  });
});
