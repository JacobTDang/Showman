/**
 * M4.1 — Agent-facing capability tools.
 *
 * A backend-agnostic `ShowmanClient` (in-process or over HTTP) plus the tool
 * definitions an MCP server exposes: get-schema, validate, preview, submit,
 * status, result. The dispatcher (`callTool`) is pure glue so it can be unit-tested
 * without an MCP transport, then wired to the SDK in server.ts.
 */

import type { SchemaDescription } from "../spec/describe.js";
import type { ValidationResult } from "../validator/validate.js";
import type { RenderService, RenderOptions } from "../service/renderService.js";
import type { JobRunner, JobView } from "../service/jobs.js";

export interface PreviewOk {
  ok: true;
  pngBase64: string;
  width: number;
  height: number;
  frame: number;
}
export interface CapabilityErr {
  ok: false;
  errors: { path: string; code: string; message: string }[];
}

export interface ShowmanClient {
  getSchema(): Promise<SchemaDescription>;
  validate(spec: unknown): Promise<ValidationResult>;
  preview(spec: unknown, frame: number): Promise<PreviewOk | CapabilityErr>;
  submit(spec: unknown, options: RenderOptions): Promise<{ ok: true; jobId: string } | CapabilityErr>;
  status(jobId: string): Promise<JobView | null>;
}

/** In-process backend backed by the RenderService + JobRunner. */
export class DirectBackend implements ShowmanClient {
  constructor(
    private readonly service: RenderService,
    private readonly jobRunner: JobRunner,
  ) {}

  async getSchema(): Promise<SchemaDescription> {
    return this.service.getSchema();
  }
  async validate(spec: unknown): Promise<ValidationResult> {
    return this.service.validate(spec);
  }
  async preview(spec: unknown, frame: number): Promise<PreviewOk | CapabilityErr> {
    const r = this.service.preview(spec, frame);
    if (!r.ok) return { ok: false, errors: r.errors };
    return { ok: true, pngBase64: r.png.toString("base64"), width: r.width, height: r.height, frame: r.frame };
  }
  async submit(spec: unknown, options: RenderOptions): Promise<{ ok: true; jobId: string } | CapabilityErr> {
    const r = await this.jobRunner.submit(spec, options);
    if (!r.ok) return { ok: false, errors: r.errors };
    return { ok: true, jobId: r.job.id };
  }
  async status(jobId: string): Promise<JobView | null> {
    return this.jobRunner.status(jobId);
  }
}

/** HTTP backend hitting a Showman gateway/worker base URL. */
export class HttpBackend implements ShowmanClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(p: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${p}`;
  }
  async getSchema(): Promise<SchemaDescription> {
    return (await this.fetchImpl(this.url("/schema"))).json() as Promise<SchemaDescription>;
  }
  async validate(spec: unknown): Promise<ValidationResult> {
    return (await this.fetchImpl(this.url("/validate"), { method: "POST", body: JSON.stringify({ spec }) })).json() as Promise<ValidationResult>;
  }
  async preview(spec: unknown, frame: number): Promise<PreviewOk | CapabilityErr> {
    const r = await this.fetchImpl(this.url(`/preview?format=json&frame=${frame}`), { method: "POST", body: JSON.stringify({ spec }) });
    if (r.status === 400) return { ok: false, errors: ((await r.json()) as { errors: CapabilityErr["errors"] }).errors };
    const j = (await r.json()) as { png: string; width: number; height: number; frame: number };
    return { ok: true, pngBase64: j.png, width: j.width, height: j.height, frame: j.frame };
  }
  async submit(spec: unknown, options: RenderOptions): Promise<{ ok: true; jobId: string } | CapabilityErr> {
    const r = await this.fetchImpl(this.url("/jobs"), { method: "POST", body: JSON.stringify({ spec, options }) });
    if (r.status === 400) return { ok: false, errors: ((await r.json()) as { errors: CapabilityErr["errors"] }).errors };
    const j = (await r.json()) as { jobId: string };
    return { ok: true, jobId: j.jobId };
  }
  async status(jobId: string): Promise<JobView | null> {
    const r = await this.fetchImpl(this.url(`/jobs/${jobId}`));
    if (r.status === 404) return null;
    return r.json() as Promise<JobView>;
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const objSpec = { type: "object", description: "A Showman Scene Spec object." };

/** The tools an agent sees. Schemas are intentionally permissive; the validator is the gate. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "showman_get_schema",
    description: "Get the Scene Spec schema (node types, animatable properties, easings, fonts, limits, and an example). Read this first to author valid scenes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "showman_validate_scene",
    description: "Validate a Scene Spec. Returns structured errors (path, code, message) you can self-correct against. Never throws.",
    inputSchema: { type: "object", properties: { spec: objSpec }, required: ["spec"] },
  },
  {
    name: "showman_preview_scene",
    description: "Render a single frame of a scene as a PNG (base64) so you can see what it looks like before committing to a full render.",
    inputSchema: { type: "object", properties: { spec: objSpec, frame: { type: "number", description: "Frame index (default 0)." } }, required: ["spec"] },
  },
  {
    name: "showman_submit_render",
    description: "Submit a scene for full video rendering. Returns a jobId immediately (async). Poll showman_job_status for the result URL.",
    inputSchema: { type: "object", properties: { spec: objSpec, options: { type: "object", description: "Render options (deterministic, crf, preset)." } }, required: ["spec"] },
  },
  {
    name: "showman_job_status",
    description: "Get the status of a render job by jobId. When done, includes the result video reference (URL/key).",
    inputSchema: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"] },
  },
];

/** Dispatch a tool call to the backend. Returns plain data (the MCP server formats it). */
export async function callTool(client: ShowmanClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "showman_get_schema":
      return client.getSchema();
    case "showman_validate_scene":
      return client.validate(args.spec);
    case "showman_preview_scene":
      return client.preview(args.spec, typeof args.frame === "number" ? args.frame : 0);
    case "showman_submit_render":
      return client.submit(args.spec, (args.options as RenderOptions) ?? {});
    case "showman_job_status":
      return client.status(String(args.jobId));
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
