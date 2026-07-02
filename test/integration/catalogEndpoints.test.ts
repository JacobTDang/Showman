import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { RenderService, LocalObjectStorage, createServer, listen, validateScene } from "../../src/index.js";

async function json<T>(r: Response): Promise<T> {
  return (await r.json()) as T;
}
type CatalogTool = { name: string; domain: string; level: string; jsonSchema: unknown };
type BuildOut = { ok: boolean; node?: { type: string }; bbox?: { w: number }; sceneSpec?: unknown; error?: string };

let server: Server;
let baseUrl: string;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "showman-catalog-"));
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  const service = new RenderService({ storage, workDir: join(dataDir, "tmp") });
  server = createServer({ service, storage });
  baseUrl = `http://127.0.0.1:${await listen(server, 0)}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

describe("catalog HTTP endpoints (orchestrator-facing)", () => {
  it("GET /catalog lists tools with JSON-Schema; ?domain filters", async () => {
    const all = await json<{ tools: CatalogTool[] }>(await fetch(`${baseUrl}/catalog`));
    const names = all.tools.map((t) => t.name);
    expect(names).toContain("math.numberLine");
    expect(names).toContain("chem.reaction");
    expect(all.tools[0]!.jsonSchema).toBeDefined();

    const math = await json<{ tools: CatalogTool[] }>(await fetch(`${baseUrl}/catalog?domain=math`));
    expect(math.tools.every((t) => t.domain === "math")).toBe(true);
  });

  it("GET /catalog/digest returns a compact text digest", async () => {
    const r = await json<{ digest: string }>(await fetch(`${baseUrl}/catalog/digest?domain=math`));
    expect(typeof r.digest).toBe("string");
    expect(r.digest).toContain("math.numberLine");
  });

  it("POST /build invokes a node-level builder", async () => {
    const r = await fetch(`${baseUrl}/build`, {
      method: "POST",
      body: JSON.stringify({ builder: "math.numberLine", params: { from: 0, to: 10 } }),
    });
    expect(r.status).toBe(200);
    const out = await json<BuildOut>(r);
    expect(out.ok).toBe(true);
    expect(out.node!.type).toBe("group");
    expect(out.bbox!.w).toBeGreaterThan(0);
  });

  it("POST /build invokes a scene-level builder into a valid spec", async () => {
    const r = await fetch(`${baseUrl}/build`, {
      method: "POST",
      body: JSON.stringify({ builder: "math.graphingLesson", params: { m: 2, b: 1 } }),
    });
    const out = await json<BuildOut>(r);
    expect(out.ok).toBe(true);
    expect(validateScene(out.sceneSpec).valid).toBe(true);
  });

  it("POST /assemble turns placements into one validated spec with a content hash", async () => {
    const r = await fetch(`${baseUrl}/assemble`, {
      method: "POST",
      body: JSON.stringify({
        placements: [{ builder: "math.numberLine", params: { from: 0, to: 10 }, slot: "center" }],
        beat: { title: "Counting", narrationBeats: ["Here is a number line."], durationBudgetSec: 5 },
        canvas: { width: 640, height: 360, fps: 30 },
        seed: 11,
      }),
    });
    expect(r.status).toBe(200);
    const out = await json<{ ok: boolean; spec: unknown; specHash: string; durationSec: number }>(r);
    expect(out.ok).toBe(true);
    expect(out.specHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.durationSec).toBe(5);
    expect(validateScene(out.spec).valid).toBe(true);
  });

  it("POST /assemble rejects a bad request with structured errors (422)", async () => {
    const r = await fetch(`${baseUrl}/assemble`, { method: "POST", body: JSON.stringify({ placements: [] }) });
    expect(r.status).toBe(422);
    const out = await json<{ ok: boolean; errors: unknown[] }>(r);
    expect(out.ok).toBe(false);
    expect(out.errors.length).toBeGreaterThan(0);
  });

  it("POST /build reports invalid params (422) and unknown builder (404)", async () => {
    const bad = await fetch(`${baseUrl}/build`, {
      method: "POST",
      body: JSON.stringify({ builder: "math.numberLine", params: { from: 5, to: 5 } }),
    });
    expect(bad.status).toBe(422);
    expect((await json<BuildOut>(bad)).error).toBe("INVALID_PARAMS");

    const unknown = await fetch(`${baseUrl}/build`, { method: "POST", body: JSON.stringify({ builder: "nope" }) });
    expect(unknown.status).toBe(404);
  });
});
