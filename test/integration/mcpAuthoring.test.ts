import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RenderService,
  LocalObjectStorage,
  InMemoryJobStore,
  JobRunner,
} from "../../src/index.js";
import { DirectBackend, TOOL_DEFINITIONS, callTool } from "../../src/mcp/showmanTools.js";
import { AuthoringAgent, ScriptedAuthor, extractJson } from "../../src/authoring/agent.js";
import type { SceneSpec } from "../../src/index.js";

function validScene(): SceneSpec {
  return {
    specVersion: 1,
    width: 64,
    height: 64,
    fps: 5,
    duration: 0.4,
    background: "#fdf6e3",
    nodes: [{ id: "dot", type: "ellipse", x: 12, y: 12, width: 40, height: 40, fill: "#e63946" }],
  };
}

let dataDir: string;
let backend: DirectBackend;

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), "showman-mcp-"));
  const storage = new LocalObjectStorage(join(dataDir, "objects"));
  const service = new RenderService({ storage, workDir: join(dataDir, "tmp") });
  const jobRunner = new JobRunner(service, new InMemoryJobStore(), { maxConcurrent: 1 });
  backend = new DirectBackend(service, jobRunner);
});
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("MCP tools (M4.1/M4.2)", () => {
  it("exposes the six-ish capability tools", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("showman_get_schema");
    expect(names).toContain("showman_validate_scene");
    expect(names).toContain("showman_preview_scene");
    expect(names).toContain("showman_submit_render");
    expect(names).toContain("showman_job_status");
  });

  it("get_schema returns the self-describing contract", async () => {
    const schema = (await callTool(backend, "showman_get_schema", {})) as { specVersion: number; example: unknown };
    expect(schema.specVersion).toBe(1);
    expect(schema.example).toBeDefined();
  });

  it("validate_scene returns structured errors", async () => {
    const ok = (await callTool(backend, "showman_validate_scene", { spec: validScene() })) as { valid: boolean };
    expect(ok.valid).toBe(true);
    const bad = (await callTool(backend, "showman_validate_scene", { spec: { specVersion: 1 } })) as { valid: boolean; errors: unknown[] };
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it("preview_scene returns an inline PNG (base64)", async () => {
    const r = (await callTool(backend, "showman_preview_scene", { spec: validScene(), frame: 0 })) as { ok: boolean; pngBase64: string };
    expect(r.ok).toBe(true);
    expect(Buffer.from(r.pngBase64, "base64").subarray(1, 4).toString("latin1")).toBe("PNG");
  });

  it("submit_render returns a jobId and status is queryable", async () => {
    const sub = (await callTool(backend, "showman_submit_render", { spec: validScene(), options: {} })) as { ok: boolean; jobId: string };
    expect(sub.ok).toBe(true);
    const status = (await callTool(backend, "showman_job_status", { jobId: sub.jobId })) as { id: string; status: string };
    expect(status.id).toBe(sub.jobId);
  });

  it("unknown tool throws", async () => {
    await expect(callTool(backend, "nope", {})).rejects.toThrow(/unknown tool/);
  });
});

describe("authoring loop (M4.3)", () => {
  it("self-corrects: invalid first attempt, valid + submitted on the second", async () => {
    const invalid = { specVersion: 1, width: 64, height: 64, fps: 5, duration: 0.4 }; // missing nodes
    const author = new ScriptedAuthor([invalid, validScene()]);
    const agent = new AuthoringAgent(backend, author, { maxAttempts: 3, preview: true });

    const result = await agent.run("Teach counting with a friendly red dot");
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.jobId).toBeTruthy();
    expect(result.history[0]!.valid).toBe(false);
    expect(result.history[1]!.valid).toBe(true);
    expect(result.history[1]!.previewed).toBe(true);
  });

  it("gives up after maxAttempts if it can never produce a valid spec", async () => {
    const author = new ScriptedAuthor([{ specVersion: 1 }]);
    const agent = new AuthoringAgent(backend, author, { maxAttempts: 2 });
    const result = await agent.run("nonsense");
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(2);
  });

  it("extractJson pulls a spec object out of chatty text", () => {
    const obj = extractJson('Sure! Here you go:\n```json\n{"a": 1, "b": {"c": "}"}}\n```\nHope that helps') as { a: number; b: { c: string } };
    expect(obj.a).toBe(1);
    expect(obj.b.c).toBe("}");
  });
});
