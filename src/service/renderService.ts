/**
 * RenderService — the capability core shared by the HTTP surface (M1.3), the async
 * job runner (M2), the distributed workers (M3), and the MCP adapter (M4). It
 * speaks the Scene Spec and returns references (not bytes) for video, inline bytes
 * only for small things (a preview frame).
 */

import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { SceneSpec } from "../spec/types.js";
import { validateScene } from "../validator/validate.js";
import type { ValidationError } from "../validator/validate.js";
import { renderFrame } from "../engine/render.js";
import { totalFrames } from "../spec/schema.js";
import { encodeSceneToFile } from "../encode/encodeVideo.js";
import { describeScene, type SchemaDescription } from "../spec/describe.js";
import type { ObjectStorage, StoredObject } from "./storage.js";

export interface RenderOptions {
  deterministic?: boolean;
  crf?: number;
  preset?: string;
  concurrency?: number;
}

export interface PreviewSuccess {
  ok: true;
  png: Buffer;
  width: number;
  height: number;
  frame: number;
  time: number;
}
export interface CapabilityFailure {
  ok: false;
  errors: ValidationError[];
}
export type PreviewResult = PreviewSuccess | CapabilityFailure;

export interface RenderSuccess {
  ok: true;
  video: StoredObject;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationSec: number;
  cached: boolean;
}
export type RenderResultRef = RenderSuccess | CapabilityFailure;

export interface RenderServiceOptions {
  storage: ObjectStorage;
  /** Scratch directory for in-flight encodes. */
  workDir: string;
  ffmpegPath?: string;
  defaultConcurrency?: number;
}

/** Stable JSON (sorted keys) so a content hash is independent of key order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export class RenderService {
  private readonly storage: ObjectStorage;
  private readonly workDir: string;
  private readonly ffmpegPath: string | undefined;
  private readonly defaultConcurrency: number;

  constructor(opts: RenderServiceOptions) {
    this.storage = opts.storage;
    this.workDir = opts.workDir;
    this.ffmpegPath = opts.ffmpegPath;
    this.defaultConcurrency = opts.defaultConcurrency ?? 1;
    mkdirSync(this.workDir, { recursive: true });
  }

  /** The self-describing schema (M4 contract). */
  getSchema(): SchemaDescription {
    return describeScene();
  }

  /** Structured validation. Never throws. */
  validate(spec: unknown) {
    return validateScene(spec);
  }

  /** A single inline preview frame (PNG). Validates first. */
  preview(spec: unknown, frame = 0): PreviewResult {
    const result = validateScene(spec);
    if (!result.valid) return { ok: false, errors: result.errors };
    const scene = spec as SceneSpec;
    const clamped = Math.max(0, Math.min(frame, totalFrames(scene.fps, scene.duration) - 1));
    const f = renderFrame(scene, clamped);
    return { ok: true, png: f.toPNG(), width: f.width, height: f.height, frame: clamped, time: f.time };
  }

  /** Deterministic content key for a (spec, options) pair. */
  jobKey(spec: SceneSpec, options: RenderOptions): string {
    const hash = createHash("sha256")
      .update(stableStringify({ spec, options: this.normalizeOptions(options) }))
      .digest("hex")
      .slice(0, 32);
    return `videos/${hash}.mp4`;
  }

  private normalizeOptions(options: RenderOptions) {
    return {
      deterministic: options.deterministic ?? false,
      crf: options.crf ?? 18,
      preset: options.preset ?? "medium",
    };
  }

  /**
   * Render to an mp4 stored in object storage; returns a reference. Idempotent:
   * the same (spec, options) hashes to the same key, so a prior render is reused
   * (determinism makes this safe and free).
   */
  async render(
    spec: unknown,
    options: RenderOptions = {},
    hooks: { onProgress?: (framesDone: number, totalFrames: number) => void } = {},
  ): Promise<RenderResultRef> {
    const result = validateScene(spec);
    if (!result.valid) return { ok: false, errors: result.errors };
    const scene = spec as SceneSpec;

    const key = this.jobKey(scene, options);
    const existing = await this.storage.stat(key);
    const fps = scene.fps;
    const frameCount = totalFrames(scene.fps, scene.duration);
    if (existing) {
      return {
        ok: true,
        video: existing,
        width: scene.width,
        height: scene.height,
        fps,
        frameCount,
        durationSec: frameCount / fps,
        cached: true,
      };
    }

    const tmp = join(this.workDir, `${randomUUID()}.mp4`);
    try {
      await encodeSceneToFile(scene, {
        outPath: tmp,
        deterministic: options.deterministic ?? false,
        crf: options.crf ?? 18,
        preset: options.preset ?? "medium",
        concurrency: options.concurrency ?? this.defaultConcurrency,
        ...(this.ffmpegPath ? { ffmpegPath: this.ffmpegPath } : {}),
        ...(hooks.onProgress ? { onProgress: hooks.onProgress } : {}),
      });
      const bytes = readFileSync(tmp);
      const video = await this.storage.put(key, bytes, "video/mp4");
      return {
        ok: true,
        video,
        width: scene.width,
        height: scene.height,
        fps,
        frameCount,
        durationSec: frameCount / fps,
        cached: false,
      };
    } finally {
      rmSync(tmp, { force: true });
    }
  }
}
