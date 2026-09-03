/**
 * M1.3 — HTTP capability surface for the stateless render worker.
 *
 * One small Node HTTP server exposing the engine's capabilities as JSON:
 *   GET  /healthz          liveness
 *   GET  /schema           self-describing Scene Spec (M4 contract)
 *   POST /validate         { spec } -> { valid, errors }
 *   POST /preview?frame=N  { spec } -> image/png (or ?format=json -> base64)
 *   POST /render           { spec, options } -> stored video reference (sync)
 *   GET  /objects/<key>    stream a stored object (the video URL points here)
 *
 * "References, not bytes": /render returns a URL into /objects, never the mp4 body.
 * Async submit/poll lives in the job runner (M2).
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import type { RenderService } from "./renderService.js";
import type { JobRunner } from "./jobs.js";
import type { AuthoringAgent } from "../authoring/agent.js";
import type { ObjectStorage } from "./storage.js";
import { guessContentType } from "./storage.js";
import { encodeSceneToStream } from "../encode/encodeVideo.js";
import type { SceneSpec } from "../spec/types.js";
import { createHash } from "node:crypto";
import { stableStringify } from "./renderService.js";
import type { PedagogyRequest } from "../authoring/semantic.js";
import {
  defaultRegistry,
  describeCatalogCompact,
  CatalogError,
  assembleScene,
  type AssembleRequest,
  type CatalogDomain,
} from "../catalog/index.js";

export interface ServerDeps {
  service: RenderService;
  storage: ObjectStorage;
  /** Optional async job runner; enables POST /jobs and GET /jobs/:id (M2.2). */
  jobRunner?: JobRunner;
  /** Optional authoring agent; enables POST /author (brief -> spec -> submit, M4.3). */
  authoringAgent?: AuthoringAgent;
  /** FFmpeg binary for streaming (M2.1). Default "ffmpeg". */
  ffmpegPath?: string;
  /** Max request body size in bytes (specs are small). Default 8 MiB. */
  maxBodyBytes?: number;
}

const MAX_BODY_DEFAULT = 8 * 1024 * 1024;

/**
 * Strip the `moderate` opt-out from client-supplied options so an untrusted caller
 * can never disable the content-safety gate over HTTP. Trusted internal callers use
 * RenderService.render directly when a post-approval bypass is genuinely needed.
 */
function stripModerateOptOut(options: Record<string, unknown> | undefined): Record<string, unknown> {
  const out = { ...(options ?? {}) };
  delete out.moderate;
  return out;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req: http.IncomingMessage, limit: number): Promise<unknown> {
  const buf = await readBody(req, limit);
  if (buf.length === 0) return {};
  return JSON.parse(buf.toString("utf8"));
}

/** Build (but do not start) the HTTP server. */
export function createServer(deps: ServerDeps): http.Server {
  const { service, storage } = deps;
  const limit = deps.maxBodyBytes ?? MAX_BODY_DEFAULT;

  return http.createServer((req, res) => {
    void handle(req, res).catch((err) => {
      if (!res.headersSent) sendJson(res, 500, { error: "internal", message: (err as Error).message });
      else res.end();
    });
  });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "GET" && path === "/healthz") return sendJson(res, 200, { ok: true });

    if (method === "GET" && path === "/schema") return sendJson(res, 200, service.getSchema());

    // Builder tool-catalog (what the orchestrator's Domain Selector chooses from).
    if (method === "GET" && path === "/catalog") {
      const registry = defaultRegistry();
      const domain = (url.searchParams.get("domain") as CatalogDomain | null) ?? undefined;
      const tools = registry.list(domain).map((t) => ({
        name: t.name,
        domain: t.domain,
        level: t.level,
        description: t.description,
        keywords: t.keywords,
        jsonSchema: registry.jsonSchema(t.name),
      }));
      return sendJson(res, 200, { tools });
    }

    if (method === "GET" && path === "/catalog/digest") {
      const domain = (url.searchParams.get("domain") as CatalogDomain | null) ?? undefined;
      return sendJson(res, 200, { digest: describeCatalogCompact(defaultRegistry(), domain) });
    }

    // Invoke one builder by name with validated params -> a node or a whole SceneSpec.
    if (method === "POST" && path === "/build") {
      const body = (await readJson(req, limit)) as { builder?: unknown; params?: unknown };
      const builder = typeof body?.builder === "string" ? body.builder : "";
      if (!builder) return sendJson(res, 400, { ok: false, error: "missing_builder" });
      const registry = defaultRegistry();
      const tool = registry.get(builder);
      if (!tool) return sendJson(res, 404, { ok: false, error: "unknown_builder", builder });
      try {
        if (tool.level === "scene") {
          return sendJson(res, 200, { ok: true, sceneSpec: registry.invokeScene(builder, body?.params ?? {}) });
        }
        const out = registry.invokeNode(builder, body?.params ?? {});
        return sendJson(res, 200, { ok: true, node: out.node, ...(out.bbox ? { bbox: out.bbox } : {}) });
      } catch (err) {
        if (err instanceof CatalogError) {
          return sendJson(res, 422, { ok: false, error: err.code, builder, issues: err.issues ?? null });
        }
        throw err;
      }
    }

    // Deterministic Scene Assembler: BuilderPlacement[] -> one validated SceneSpec (+hash).
    // The engine-side half of the orchestrator's per-scene pipeline; pure, no LLM.
    if (method === "POST" && path === "/assemble") {
      const body = (await readJson(req, limit)) as AssembleRequest;
      const result = assembleScene(defaultRegistry(), body);
      if (!result.ok) return sendJson(res, 422, { ok: false, errors: result.errors });
      return sendJson(res, 200, {
        ok: true,
        spec: result.spec,
        specHash: result.specHash,
        durationSec: result.durationSec,
        ...(result.repaired.length ? { repaired: result.repaired } : {}),
      });
    }

    if (method === "POST" && path === "/validate") {
      const body = (await readJson(req, limit)) as { spec?: unknown };
      return sendJson(res, 200, service.validate(body?.spec ?? body));
    }

    if (method === "POST" && path === "/preview") {
      const body = (await readJson(req, limit)) as { spec?: unknown; frame?: number };
      const frame = body?.frame ?? Number(url.searchParams.get("frame") ?? 0);
      const spec = body?.spec ?? body;
      const validation = service.validate(spec);
      if (!validation.valid) return sendJson(res, 400, { valid: false, errors: validation.errors });
      // The safety gate applies to previews too (no unsafe imagery, even one frame).
      const verdict = await service.moderate(spec as SceneSpec);
      if (!verdict.safe) return sendJson(res, 422, { error: "content_safety", findings: verdict.findings });
      const result = service.preview(spec, frame);
      if (!result.ok) return sendJson(res, 400, { valid: false, errors: result.errors });
      if (url.searchParams.get("format") === "json") {
        return sendJson(res, 200, {
          width: result.width,
          height: result.height,
          frame: result.frame,
          time: result.time,
          png: result.png.toString("base64"),
        });
      }
      res.writeHead(200, { "content-type": "image/png", "content-length": result.png.length });
      return void res.end(result.png);
    }

    if (method === "POST" && path === "/render") {
      const body = (await readJson(req, limit)) as { spec?: unknown; options?: Record<string, unknown> };
      const result = await service.render(body?.spec ?? body, stripModerateOptOut(body?.options));
      if (!result.ok) {
        if ("blocked" in result) return sendJson(res, 422, { error: "content_safety", findings: result.findings });
        return sendJson(res, 400, { error: "invalid_spec", errors: result.errors });
      }
      return sendJson(res, 200, {
        video: result.video,
        ...(result.captions ? { captions: result.captions } : {}),
        hasAudio: result.hasAudio,
        width: result.width,
        height: result.height,
        fps: result.fps,
        frameCount: result.frameCount,
        durationSec: result.durationSec,
        cached: result.cached,
      });
    }

    if (method === "POST" && path === "/render/stream") {
      const body = (await readJson(req, limit)) as { spec?: unknown; options?: Record<string, unknown> };
      const spec = body?.spec ?? body;
      const validation = service.validate(spec);
      if (!validation.valid) return sendJson(res, 400, { error: "invalid_spec", errors: validation.errors });
      // Content-safety gate also applies to the streaming path (release blocker).
      const verdict = await service.moderate(spec as SceneSpec);
      if (!verdict.safe) return sendJson(res, 422, { error: "content_safety", findings: verdict.findings });
      res.writeHead(200, { "content-type": "video/mp4", "transfer-encoding": "chunked" });
      try {
        await encodeSceneToStream(spec as SceneSpec, res, {
          concurrency: typeof body?.options?.["concurrency"] === "number" ? (body.options["concurrency"] as number) : 1,
          ...(deps.ffmpegPath ? { ffmpegPath: deps.ffmpegPath } : {}),
        });
      } finally {
        res.end();
      }
      return;
    }

    if (method === "POST" && path === "/author") {
      if (!deps.authoringAgent) return sendJson(res, 501, { error: "authoring_disabled" });
      const body = (await readJson(req, limit)) as { brief?: unknown };
      const brief = typeof body?.brief === "string" ? body.brief : "";
      if (!brief.trim()) return sendJson(res, 400, { error: "missing_brief", message: "Provide a non-empty 'brief' string." });
      const result = await deps.authoringAgent.run(brief);
      if (!result.ok) return sendJson(res, 422, { error: "authoring_failed", attempts: result.attempts, history: result.history });
      return sendJson(res, 202, { jobId: result.jobId, attempts: result.attempts, statusUrl: `/jobs/${result.jobId}` });
    }

    // The atomic "agent tool" call: a brief in, a finished MP4 out, in one synchronous request.
    // No schema fetch, no spec authoring, no job polling for the caller — just `{ brief }`.
    if (method === "POST" && (path === "/v1/generate" || path === "/generate")) {
      if (!deps.authoringAgent) return sendJson(res, 501, { error: "authoring_disabled" });
      const body = (await readJson(req, limit)) as Partial<PedagogyRequest> & {
        brief?: unknown;
        options?: Record<string, unknown>;
        includeSpec?: boolean;
      };
      const brief = typeof body?.brief === "string" ? body.brief : "";
      if (!brief.trim()) return sendJson(res, 400, { error: "missing_brief", message: "Provide a non-empty 'brief' string." });
      const listFields = ["objectives", "prerequisites", "mustShow", "misconceptions", "forbid"] as const;
      for (const field of listFields) {
        if (body[field] !== undefined && (!Array.isArray(body[field]) || body[field]!.some((v) => typeof v !== "string"))) {
          return sendJson(res, 400, { error: "invalid_request", message: `'${field}' must be an array of strings.` });
        }
      }
      if (body.durationBudgetSec !== undefined && (!Number.isFinite(body.durationBudgetSec) || body.durationBudgetSec <= 0)) {
        return sendJson(res, 400, { error: "invalid_request", message: "'durationBudgetSec' must be a positive number." });
      }
      const request: PedagogyRequest = {
        brief,
        ...(typeof body.audience === "string" ? { audience: body.audience } : {}),
        ...(typeof body.topic === "string" ? { topic: body.topic } : {}),
        ...(body.depth === "quick" || body.depth === "standard" || body.depth === "deep" ? { depth: body.depth } : {}),
        ...(body.durationMode === "hard" || body.durationMode === "soft" ? { durationMode: body.durationMode } : {}),
        ...Object.fromEntries(listFields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]])),
        ...(body.durationBudgetSec !== undefined ? { durationBudgetSec: body.durationBudgetSec } : {}),
      };
      const authored = await deps.authoringAgent.authorSpec(request);
      if (!authored.ok || !authored.spec) {
        return sendJson(res, 422, { error: "authoring_failed", attempts: authored.attempts, history: authored.history });
      }
      const budget = request.durationBudgetSec;
      const durationMode = request.durationMode ?? "soft";
      if (budget !== undefined && durationMode === "hard" && authored.spec.duration > budget + 0.1) {
        return sendJson(res, 422, {
          error: "duration_budget_exceeded",
          requestedDurationSec: budget,
          authoredDurationSec: authored.spec.duration,
          toleranceSec: 0.1,
        });
      }
      const result = await service.render(authored.spec, stripModerateOptOut(body?.options));
      if (!result.ok) {
        if ("blocked" in result) return sendJson(res, 422, { error: "content_safety", findings: result.findings });
        return sendJson(res, 400, { error: "invalid_spec", errors: result.errors });
      }
      if (budget !== undefined && durationMode === "hard" && result.durationSec > budget + 0.1) {
        return sendJson(res, 422, {
          error: "duration_budget_exceeded",
          requestedDurationSec: budget,
          actualDurationSec: result.durationSec,
          toleranceSec: 0.1,
        });
      }
      const specHash = createHash("sha256").update(stableStringify(authored.spec)).digest("hex");
      const specKey = `specs/${specHash}.json`;
      await storage.put(specKey, Buffer.from(stableStringify(authored.spec)), "application/json");
      const warning =
        budget !== undefined && result.durationSec > budget + 0.1
          ? { code: "duration_budget_expanded", requestedDurationSec: budget, actualDurationSec: result.durationSec }
          : undefined;
      return sendJson(res, 200, {
        videoUrl: result.video.url,
        video: result.video,
        brief,
        attempts: authored.attempts,
        provenance: {
          ...deps.authoringAgent.provenance(),
          requestId: req.headers["x-request-id"] ?? createHash("sha256").update(`${specHash}:${Date.now()}`).digest("hex").slice(0, 20),
          specHash,
          specKey,
          validation: {
            schemaValid: true,
            semantic: authored.history.at(-1)?.semantic,
            a11y: authored.history.at(-1)?.a11y,
            lesson: authored.history.at(-1)?.lesson,
            repairs: authored.history.flatMap((a) => a.repaired ?? []),
          },
        },
        ...(body.includeSpec === false ? {} : { spec: authored.spec }),
        ...(warning ? { warnings: [warning] } : {}),
        ...(result.captions ? { captions: result.captions } : {}),
        hasAudio: result.hasAudio,
        width: result.width,
        height: result.height,
        fps: result.fps,
        frameCount: result.frameCount,
        durationSec: result.durationSec,
        cached: result.cached,
      });
    }

    if (method === "POST" && path === "/jobs") {
      if (!deps.jobRunner) return sendJson(res, 501, { error: "jobs_disabled" });
      const body = (await readJson(req, limit)) as { spec?: unknown; options?: Record<string, unknown> };
      const submitted = await deps.jobRunner.submit(body?.spec ?? body, stripModerateOptOut(body?.options));
      if (!submitted.ok) return sendJson(res, 400, { error: "invalid_spec", errors: submitted.errors });
      return sendJson(res, 202, { jobId: submitted.job.id, status: submitted.job.status, statusUrl: `/jobs/${submitted.job.id}` });
    }

    if (method === "GET" && path.startsWith("/jobs/")) {
      if (!deps.jobRunner) return sendJson(res, 501, { error: "jobs_disabled" });
      const id = decodeURIComponent(path.slice("/jobs/".length));
      const view = await deps.jobRunner.status(id);
      if (!view) return sendJson(res, 404, { error: "not_found", id });
      return sendJson(res, 200, view);
    }

    if (method === "GET" && path.startsWith("/objects/")) {
      const key = decodeURIComponent(path.slice("/objects/".length));
      return serveObject(storage, key, req, res);
    }

    sendJson(res, 404, { error: "not_found", path });
  }
}

interface ByteRange {
  start: number;
  end: number;
}

function parseByteRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return null;
  const [, startText = "", endText = ""] = match;
  if (!startText && !endText) return null;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start)
    return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}

async function serveObject(storage: ObjectStorage, key: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const stat = await storage.stat(key);
  if (!stat) return sendJson(res, 404, { error: "not_found", key });
  const rangeHeader = req.headers.range;
  const range = (typeof rangeHeader === "string" ? parseByteRange(rangeHeader, stat.size) : undefined) ?? undefined;
  if (rangeHeader !== undefined && !range) {
    res.writeHead(416, { "content-range": `bytes */${stat.size}`, "accept-ranges": "bytes" });
    return void res.end();
  }
  const headers: Record<string, string | number> = {
    "content-type": stat.contentType || guessContentType(key),
    "accept-ranges": "bytes",
    "content-length": range ? range.end - range.start + 1 : stat.size,
    ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${stat.size}` } : {}),
  };
  res.writeHead(range ? 206 : 200, headers);
  if (storage.openRead) {
    storage.openRead(key, range).pipe(res);
  } else {
    const bytes = await storage.get(key);
    res.end(range ? bytes.subarray(range.start, range.end + 1) : bytes);
  }
}

/** Start the server on `port` (0 = ephemeral). Resolves with the bound port. */
export function listen(server: http.Server, port = 0, host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve((server.address() as AddressInfo).port));
  });
}
