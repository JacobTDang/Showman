import { hasFfmpeg } from "../helpers.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RenderService, LocalObjectStorage, InMemoryJobStore, JobRunner, TemplateAuthor } from "../../src/index.js";
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
  it("exposes the capability tools incl. the atomic generate-video tool", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("showman_generate_video");
    expect(names).toContain("showman_get_schema");
    expect(names).toContain("showman_validate_scene");
    expect(names).toContain("showman_preview_scene");
    expect(names).toContain("showman_submit_render");
    expect(names).toContain("showman_job_status");
  });

  it("showman_generate_video makes a finished MP4 from a brief in ONE tool call", async () => {
    if (!(await hasFfmpeg())) return expect.unreachable("ffmpeg required");
    // A small offline author keeps the render fast; inject it so generate() doesn't lazy-build a big one.
    const storage = new LocalObjectStorage(join(dataDir, "gen-objects"));
    const service = new RenderService({ storage, workDir: join(dataDir, "gen-tmp") });
    const jobRunner = new JobRunner(service, new InMemoryJobStore(), { maxConcurrent: 1 });
    const agent = new AuthoringAgent(new DirectBackend(service, jobRunner), new TemplateAuthor({ width: 320, height: 180, fps: 8 }), {
      maxAttempts: 2,
    });
    const gb = new DirectBackend(service, jobRunner, agent);
    const res = (await callTool(gb, "showman_generate_video", { brief: "teach counting to three with stars" })) as {
      ok: boolean;
      videoUrl?: string;
      durationSec?: number;
      attempts?: number;
      provenance?: { specHash: string; specKey: string; provider: string };
    };
    expect(res.ok).toBe(true);
    expect(res.videoUrl).toBeTruthy();
    expect(res.durationSec!).toBeGreaterThan(0);
    expect(res.attempts!).toBeGreaterThanOrEqual(1);
    expect(res.provenance).toMatchObject({ provider: "offline" });
    expect(res.provenance!.specHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("showman_generate_video enforces structured hard duration budgets before rendering", async () => {
    const storage = new LocalObjectStorage(join(dataDir, "budget-objects"));
    const service = new RenderService({ storage, workDir: join(dataDir, "budget-tmp") });
    const jobRunner = new JobRunner(service, new InMemoryJobStore(), { maxConcurrent: 1 });
    const agent = new AuthoringAgent(new DirectBackend(service, jobRunner), new TemplateAuthor({ width: 320, height: 180, fps: 8 }), {
      maxAttempts: 2,
    });
    const result = (await callTool(new DirectBackend(service, jobRunner, agent), "showman_generate_video", {
      brief: "teach counting to three with stars",
      audience: "elementary",
      objectives: ["count three objects"],
      depth: "quick",
      mustShow: ["3"],
      durationBudgetSec: 0.5,
      durationMode: "hard",
    })) as { ok: boolean; error?: string };
    expect(result).toEqual(expect.objectContaining({ ok: false, error: "duration_budget_exceeded" }));
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

  it("rejects an unrelated schema-valid scene and retries on semantic anchors", async () => {
    const percentage = {
      ...validScene(),
      nodes: [{ id: "percent", type: "text", text: "Percents: 2 out of every 100", x: 2, y: 20, fontSize: 8, fill: "#111111" }],
    } satisfies SceneSpec;
    const circuit = {
      ...validScene(),
      nodes: [{ id: "rc-circuit", type: "text", text: "Battery → Resistor → Capacitor", x: 2, y: 20, fontSize: 8, fill: "#111111" }],
    } satisfies SceneSpec;
    const agent = new AuthoringAgent(backend, new ScriptedAuthor([percentage, circuit]), { maxAttempts: 2 });

    const result = await agent.authorSpec({
      brief: "Explain an RC charging circuit",
      mustShow: ["battery", "resistor", "capacitor"],
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.history[0]!.semantic).toMatchObject({ passed: false, missing: ["battery", "resistor", "capacitor"] });
    expect(result.history[1]!.semantic).toMatchObject({ passed: true, missing: [] });
  });

  it("extractJson pulls a spec object out of chatty text", () => {
    const obj = extractJson('Sure! Here you go:\n```json\n{"a": 1, "b": {"c": "}"}}\n```\nHope that helps') as {
      a: number;
      b: { c: string };
    };
    expect(obj.a).toBe(1);
    expect(obj.b.c).toBe("}");
  });
});
