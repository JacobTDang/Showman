import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { RenderService, LocalObjectStorage, createServer, listen } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";

const execFileAsync = promisify(execFile);

// Test helper: fetch JSON body as `any` (keeps assertions terse).
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
    width: 160,
    height: 90,
    fps: 10,
    duration: 0.5, // 5 frames
    background: "#fdf6e3",
    nodes: [{ id: "box", type: "rect", x: 20, y: 20, width: 40, height: 40, fill: "#e63946" }],
  };
}

let server: Server;
let baseUrl: string;
let dataDir: string;
let ffmpeg = false;

beforeAll(async () => {
  ffmpeg = await hasFfmpeg();
  dataDir = mkdtempSync(join(tmpdir(), "showman-http-"));
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  const service = new RenderService({ storage, workDir: join(dataDir, "tmp") });
  server = createServer({ service, storage });
  const port = await listen(server, 0);
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

const post = (path: string, payload: unknown) => fetch(`${baseUrl}${path}`, { method: "POST", body: JSON.stringify(payload) });

describe("HTTP capability surface (M1.3)", () => {
  it("GET /healthz", async () => {
    const r = await fetch(`${baseUrl}/healthz`);
    expect(r.status).toBe(200);
    expect(await body(r)).toEqual({ ok: true });
  });

  it("GET /schema returns a self-describing contract", async () => {
    const r = await fetch(`${baseUrl}/schema`);
    expect(r.status).toBe(200);
    const schema = await body(r);
    expect(schema.specVersion).toBe(1);
    expect(schema.nodeTypes).toHaveProperty("text");
    expect(Array.isArray(schema.easings)).toBe(true);
    expect(schema.example).toBeDefined();
  });

  it("POST /validate accepts a good spec and rejects a bad one with structured errors", async () => {
    expect((await body(await post("/validate", { spec: scene() }))).valid).toBe(true);

    const bad = await body(await post("/validate", { spec: { ...scene(), nodes: [{ id: "x", type: "rect", widht: 5 }] } }));
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e: { code: string }) => e.code === "UNKNOWN_PROPERTY")).toBe(true);
  });

  it("POST /preview returns a PNG, and JSON base64 with ?format=json", async () => {
    const png = await post("/preview?frame=0", { spec: scene() });
    expect(png.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await png.arrayBuffer());
    expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");

    const asJson = await body(await post("/preview?format=json", { spec: scene() }));
    expect(asJson.width).toBe(160);
    expect(typeof asJson.png).toBe("string");
  });

  it("POST /preview returns 400 with errors for an invalid spec", async () => {
    const r = await post("/preview", { spec: { specVersion: 1 } });
    expect(r.status).toBe(400);
    expect((await body(r)).valid).toBe(false);
  });

  it("POST /render stores an mp4, returns a reference, and is idempotent (cached)", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const first = await body(await post("/render", { spec: scene(), options: { deterministic: true } }));
    expect(first.video.key).toMatch(/^videos\/.+\.mp4$/);
    expect(first.frameCount).toBe(5);
    expect(first.cached).toBe(false);

    // Second identical render is served from cache (determinism => idempotency).
    const second = await body(await post("/render", { spec: scene(), options: { deterministic: true } }));
    expect(second.video.key).toBe(first.video.key);
    expect(second.cached).toBe(true);

    // The stored object is fetchable and is a real mp4.
    const obj = await fetch(`${baseUrl}/objects/${first.video.key}`);
    expect(obj.headers.get("content-type")).toBe("video/mp4");
    const mp4 = Buffer.from(await obj.arrayBuffer());
    expect(mp4.subarray(4, 8).toString("latin1")).toBe("ftyp");
  });

  it("unknown route 404s", async () => {
    const r = await fetch(`${baseUrl}/nope`);
    expect(r.status).toBe(404);
  });
});
