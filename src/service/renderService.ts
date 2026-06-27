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
import { synthesizeNarration, type TtsProvider } from "../audio/tts.js";
import { muxAudioVideo } from "../audio/mux.js";
import { captionsFromNarration, toVTT } from "../audio/captions.js";
import { moderateScene, type ModerationProvider, type ModerationFinding } from "../safety/moderation.js";

export interface RenderOptions {
  deterministic?: boolean;
  crf?: number;
  preset?: string;
  concurrency?: number;
  /** Synthesize + mux narration audio if the spec has a narration track. Default true. */
  narrate?: boolean;
  /** Emit a WebVTT caption sidecar from the narration. Default true. */
  captions?: boolean;
  /** Run the content-safety gate before rendering. Default true (when a provider is configured). */
  moderate?: boolean;
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
  /** WebVTT caption sidecar, when narration captions were generated. */
  captions?: StoredObject;
  hasAudio: boolean;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationSec: number;
  cached: boolean;
}
/** Blocked by the content-safety gate (M5.7) — a release blocker for a kids' product. */
export interface RenderBlocked {
  ok: false;
  blocked: "content_safety";
  findings: ModerationFinding[];
}
export type RenderResultRef = RenderSuccess | CapabilityFailure | RenderBlocked;

export interface RenderServiceOptions {
  storage: ObjectStorage;
  /** Scratch directory for in-flight encodes. */
  workDir: string;
  ffmpegPath?: string;
  defaultConcurrency?: number;
  /** TTS provider for narration (M5.4). If unset, narration is skipped. */
  tts?: TtsProvider;
  /** Moderation provider for the safety gate (M5.7). If unset, the gate is skipped. */
  moderation?: ModerationProvider;
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
  private readonly tts: TtsProvider | undefined;
  private readonly moderation: ModerationProvider | undefined;

  constructor(opts: RenderServiceOptions) {
    this.storage = opts.storage;
    this.workDir = opts.workDir;
    this.ffmpegPath = opts.ffmpegPath;
    this.defaultConcurrency = opts.defaultConcurrency ?? 1;
    this.tts = opts.tts;
    this.moderation = opts.moderation;
    mkdirSync(this.workDir, { recursive: true });
  }

  /** Run the content-safety gate on a spec (M5.7). Returns `{ safe, findings }`. */
  async moderate(spec: SceneSpec) {
    if (!this.moderation) return { safe: true, findings: [] };
    return moderateScene(spec, this.moderation);
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
      narrate: options.narrate ?? true,
      hasTts: !!this.tts,
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

    // Content-safety gate (M5.7) — a release blocker. Runs before any rendering.
    if (this.moderation && options.moderate !== false) {
      const verdict = await moderateScene(scene, this.moderation);
      if (!verdict.safe) return { ok: false, blocked: "content_safety", findings: verdict.findings };
    }

    const wantNarration = !!scene.narration?.segments?.length && options.narrate !== false && !!this.tts;
    const wantCaptions = !!scene.narration?.segments?.length && options.captions !== false;

    const key = this.jobKey(scene, options);
    const captionKey = key.replace(/\.mp4$/, ".vtt");
    const existing = await this.storage.stat(key);
    const fps = scene.fps;
    const frameCount = totalFrames(scene.fps, scene.duration);
    if (existing) {
      let captions = wantCaptions ? await this.storage.stat(captionKey) : null;
      // The video hash doesn't include caption state, so a video cached before
      // captions were requested won't have the sidecar — regenerate it on demand.
      if (wantCaptions && !captions) {
        const vtt = toVTT(captionsFromNarration(scene.narration!, frameCount / fps));
        captions = await this.storage.put(captionKey, Buffer.from(vtt, "utf8"), "text/vtt");
      }
      return {
        ok: true,
        video: existing,
        ...(captions ? { captions } : {}),
        hasAudio: wantNarration,
        width: scene.width,
        height: scene.height,
        fps,
        frameCount,
        durationSec: frameCount / fps,
        cached: true,
      };
    }

    const tmp = join(this.workDir, `${randomUUID()}.mp4`);
    const tmpMuxed = join(this.workDir, `${randomUUID()}.mp4`);
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

      let videoPath = tmp;
      let segmentDurations: number[] | undefined;
      if (wantNarration && this.tts) {
        const synth = await synthesizeNarration(this.tts, scene.narration!, frameCount / fps);
        segmentDurations = synth.segmentDurations;
        await muxAudioVideo(tmp, synth.wav, tmpMuxed, this.ffmpegPath ? { ffmpegPath: this.ffmpegPath } : {});
        videoPath = tmpMuxed;
      }

      const video = await this.storage.put(key, readFileSync(videoPath), "video/mp4");

      let captions: StoredObject | undefined;
      if (wantCaptions) {
        const vtt = toVTT(captionsFromNarration(scene.narration!, frameCount / fps, segmentDurations));
        captions = await this.storage.put(captionKey, Buffer.from(vtt, "utf8"), "text/vtt");
      }

      return {
        ok: true,
        video,
        ...(captions ? { captions } : {}),
        hasAudio: wantNarration,
        width: scene.width,
        height: scene.height,
        fps,
        frameCount,
        durationSec: frameCount / fps,
        cached: false,
      };
    } finally {
      rmSync(tmp, { force: true });
      rmSync(tmpMuxed, { force: true });
    }
  }
}
