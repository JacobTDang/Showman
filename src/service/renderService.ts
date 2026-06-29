/**
 * RenderService — the capability core shared by the HTTP surface (M1.3), the async
 * job runner (M2), the distributed workers (M3), and the MCP adapter (M4). It
 * speaks the Scene Spec and returns references (not bytes) for video, inline bytes
 * only for small things (a preview frame).
 */

import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { SceneSpec, NarrationTrack } from "../spec/types.js";
import { validateScene } from "../validator/validate.js";
import type { ValidationError } from "../validator/validate.js";
import { renderFrame } from "../engine/render.js";
import { totalFrames, LIMITS } from "../spec/schema.js";
import { encodeSceneToFile } from "../encode/encodeVideo.js";
import { describeScene, type SchemaDescription } from "../spec/describe.js";
import { validateInteractions, toInteractionsJson } from "../interaction/index.js";
import type { InteractionTrack } from "../interaction/types.js";
import type { ObjectStorage, StoredObject } from "./storage.js";
import { synthesizeNarration, narrationCharCount, measureNarration, fitSceneDuration, type TtsProvider } from "../audio/tts.js";
import { muxAudioVideo } from "../audio/mux.js";
import { captionsFromNarration, toVTT, toSRT } from "../audio/captions.js";
import { moderateScene, type ModerationProvider, type ModerationFinding } from "../safety/moderation.js";

export interface RenderOptions {
  deterministic?: boolean;
  crf?: number;
  preset?: string;
  concurrency?: number;
  /** Synthesize + mux narration audio if the spec has a narration track. Default true. */
  narrate?: boolean;
  /** Emit WebVTT + SRT caption sidecars from the narration. Default true. */
  captions?: boolean;
  /** Emit the interactions.json sidecar when the scene has interactions. Default true. */
  interactions?: boolean;
  /** Run the content-safety gate before rendering. Default true (when a provider is configured). */
  moderate?: boolean;
  /** Extend the scene duration to fit real narration audio (avoids a truncated last line). Default false. */
  fitNarration?: boolean;
  /** Max narration segments synthesized concurrently. Default 4. */
  ttsConcurrency?: number;
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
  /** SubRip (.srt) caption sidecar, alongside the WebVTT one. */
  captionsSrt?: StoredObject;
  /** Interaction sidecar (`interactions.json`), when the scene has interactions. */
  interactions?: StoredObject;
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
    const wantInteractions = !!scene.interactions?.cues?.length && options.interactions !== false;

    // Cost/abuse guard: cap total narration characters BEFORE any (paid) TTS call — including
    // the measureNarration pass below (which synthesizes every segment to measure it).
    if (wantNarration) {
      const maxChars = Number(process.env.SHOWMAN_TTS_MAX_CHARS) || 20000;
      const chars = narrationCharCount(scene.narration!);
      if (chars > maxChars) {
        throw new Error(`Narration is ${chars} characters, over the TTS cost guard of ${maxChars} (raise SHOWMAN_TTS_MAX_CHARS to allow).`);
      }
    }

    // Optionally extend the scene so real narration audio isn't truncated by the fixed-length
    // mix buffer (opt-in; measureNarration reuses cached clips, so it's cheap). The fitted
    // duration is derived from untrusted segment times, so re-enforce the farm-protection limits.
    let renderScene = scene;
    if (options.fitNarration && wantNarration && this.tts) {
      const { requiredDuration } = await measureNarration(this.tts, scene.narration!);
      const fitted = fitSceneDuration(scene.duration, requiredDuration);
      if (Number.isFinite(fitted) && fitted > scene.duration) {
        if (fitted > LIMITS.maxDuration || totalFrames(scene.fps, fitted) > LIMITS.maxFrames) {
          return {
            ok: false,
            errors: [
              {
                path: "duration",
                property: "duration",
                code: "LIMIT_EXCEEDED",
                message: `Narration-fitted duration ${fitted.toFixed(1)}s exceeds limits (maxDuration ${LIMITS.maxDuration}s, maxFrames ${LIMITS.maxFrames}).`,
              },
            ],
          };
        }
        renderScene = { ...scene, duration: fitted };
      }
    }

    // The mp4 is interaction-blind, so the video cache key excludes interactions — editing a
    // quiz over a stable video reuses the encode and only the sidecar is rewritten.
    const key = this.jobKey({ ...renderScene, interactions: undefined }, options);
    const captionKey = key.replace(/\.mp4$/, ".vtt");
    const interKey = key.replace(/\.mp4$/, ".interactions.json");
    const existing = await this.storage.stat(key);
    const fps = renderScene.fps;
    const frameCount = totalFrames(renderScene.fps, renderScene.duration);
    // Fail fast on a malformed track — validated against the SAME (fitted, frame-rounded)
    // duration the emitted sidecar uses, before any expensive encode.
    if (wantInteractions) {
      const iErrors = validateInteractions(renderScene.interactions!, { duration: frameCount / fps });
      if (iErrors.length > 0) throw new Error(`Invalid interactions: ${iErrors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
    }
    if (existing) {
      let caps: { captions: StoredObject; captionsSrt: StoredObject } | undefined;
      if (wantCaptions) {
        // Preserve the accurate sidecars from the original render (their cue times track the
        // real synthesized durations); only (re)generate if one is missing.
        const srtKey = captionKey.replace(/\.vtt$/, ".srt");
        const [vtt, srt] = await Promise.all([this.storage.stat(captionKey), this.storage.stat(srtKey)]);
        caps =
          vtt && srt ? { captions: vtt, captionsSrt: srt } : await this.putCaptions(captionKey, renderScene.narration!, frameCount / fps);
      }
      // Always rewrite the sidecar from the current interactions (the video key ignores them).
      const inter = wantInteractions ? await this.putInteractions(interKey, renderScene.interactions!, frameCount / fps) : undefined;
      return {
        ok: true,
        video: existing,
        ...(caps ?? {}),
        ...(inter ? { interactions: inter } : {}),
        hasAudio: wantNarration,
        width: renderScene.width,
        height: renderScene.height,
        fps,
        frameCount,
        durationSec: frameCount / fps,
        cached: true,
      };
    }

    const tmp = join(this.workDir, `${randomUUID()}.mp4`);
    const tmpMuxed = join(this.workDir, `${randomUUID()}.mp4`);
    try {
      await encodeSceneToFile(renderScene, {
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
        const synth = await synthesizeNarration(this.tts, renderScene.narration!, frameCount / fps, undefined, {
          concurrency: options.ttsConcurrency ?? 4,
        });
        segmentDurations = synth.segmentDurations;
        await muxAudioVideo(tmp, synth.wav, tmpMuxed, this.ffmpegPath ? { ffmpegPath: this.ffmpegPath } : {});
        videoPath = tmpMuxed;
      }

      const video = await this.storage.put(key, readFileSync(videoPath), "video/mp4");
      const caps = wantCaptions
        ? await this.putCaptions(captionKey, renderScene.narration!, frameCount / fps, segmentDurations)
        : undefined;
      const inter = wantInteractions ? await this.putInteractions(interKey, renderScene.interactions!, frameCount / fps) : undefined;

      return {
        ok: true,
        video,
        ...(caps ?? {}),
        ...(inter ? { interactions: inter } : {}),
        hasAudio: wantNarration,
        width: renderScene.width,
        height: renderScene.height,
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

  /** Write the WebVTT + SRT caption sidecars from a narration track and return both refs. */
  private async putCaptions(
    captionKey: string,
    narration: NarrationTrack,
    sceneDuration: number,
    segmentDurations?: number[],
  ): Promise<{ captions: StoredObject; captionsSrt: StoredObject }> {
    const cues = captionsFromNarration(narration, sceneDuration, segmentDurations);
    const captions = await this.storage.put(captionKey, Buffer.from(toVTT(cues), "utf8"), "text/vtt");
    const captionsSrt = await this.storage.put(
      captionKey.replace(/\.vtt$/, ".srt"),
      Buffer.from(toSRT(cues), "utf8"),
      "application/x-subrip",
    );
    return { captions, captionsSrt };
  }

  /** Validate and write the interactions.json sidecar; throws on an invalid track. */
  private async putInteractions(interKey: string, track: InteractionTrack, sceneDuration: number): Promise<StoredObject> {
    const errors = validateInteractions(track, { duration: sceneDuration });
    if (errors.length > 0) {
      throw new Error(`Invalid interactions: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
    }
    return this.storage.put(interKey, Buffer.from(toInteractionsJson(track), "utf8"), "application/json");
  }
}
