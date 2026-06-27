/**
 * M1.2 — Frame encoding: spec -> mp4.
 *
 * The engine renders frames as raw RGBA; FFmpeg consumes them straight off a pipe
 * (no disk hop) and muxes an mp4. Because each frame is a deterministic pure
 * function, the *frame stream* is reproducible; this module turns that stream into
 * a video file.
 *
 * This is the sequential encoder. The intra-worker frame pool (M1.1) parallelizes
 * frame production across cores; it feeds the same pipe.
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import type { SceneSpec } from "../spec/types.js";
import { totalFrames } from "../spec/schema.js";
import { renderFrame } from "../engine/render.js";

export interface EncodeOptions {
  /** Output file path (…/clip.mp4). */
  outPath: string;
  /** x264 constant rate factor (lower = higher quality). Default 18. */
  crf?: number;
  /** x264 preset. Default "medium". */
  preset?: string;
  /** Output pixel format. Default "yuv420p" (broad playback compatibility). */
  pixelFormat?: string;
  /** FFmpeg binary. Default "ffmpeg" (resolved from PATH). */
  ffmpegPath?: string;
  /**
   * Force byte-reproducible encoding: single-threaded x264 with deterministic
   * params. Slower, but two runs produce identical files. Default false.
   */
  deterministic?: boolean;
  /** Optional callback invoked after each frame is produced (for progress). */
  onProgress?: (framesDone: number, totalFrames: number) => void;
}

export interface EncodeResult {
  outPath: string;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationSec: number;
}

/**
 * Render every frame of `spec` and encode them to an mp4 at `options.outPath`.
 * Resolves with the output's dimensions and frame/duration metadata.
 */
export async function encodeSceneToFile(spec: SceneSpec, options: EncodeOptions): Promise<EncodeResult> {
  const { width, height, fps } = spec;
  const frameCount = totalFrames(fps, spec.duration);
  const {
    outPath,
    crf = 18,
    preset = "medium",
    pixelFormat = "yuv420p",
    ffmpegPath = "ffmpeg",
    deterministic = false,
    onProgress,
  } = options;

  const args = [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${width}x${height}`,
    "-r", String(fps),
    "-i", "pipe:0",
    "-an",
    "-c:v", "libx264",
    "-preset", preset,
    "-crf", String(crf),
    "-pix_fmt", pixelFormat,
    "-movflags", "+faststart",
  ];
  if (deterministic) {
    // Single-threaded x264 (frame-thread order is otherwise a source of variance) and
    // bitexact muxing so no creation-time / encoder-version metadata leaks into the
    // container. Together these make two runs produce byte-identical mp4s.
    args.push(
      "-threads", "1",
      "-x264-params", "threads=1:sliced-threads=0",
      "-bitexact",
      "-fflags", "+bitexact",
      "-flags:v", "+bitexact",
      "-map_metadata", "-1",
    );
  }
  args.push(outPath);

  const proc = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });

  let stderr = "";
  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
    if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
  });

  // Surface spawn errors (e.g. ffmpeg not found) as a rejected promise.
  const spawnErr = new Promise<never>((_, reject) => {
    proc.on("error", (err) => reject(new Error(`Failed to start ffmpeg ("${ffmpegPath}"): ${err.message}`)));
  });

  const exited = new Promise<void>((resolve, reject) => {
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}.\n${stderr.slice(-2000)}`));
    });
  });

  const stdin = proc.stdin;
  if (!stdin) throw new Error("ffmpeg stdin unavailable");

  const pump = (async () => {
    for (let i = 0; i < frameCount; i++) {
      const { pixels } = renderFrame(spec, i);
      const buf = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
      if (!stdin.write(buf)) {
        await once(stdin, "drain");
      }
      onProgress?.(i + 1, frameCount);
    }
    stdin.end();
  })();

  // If ffmpeg dies mid-pump, the write would EPIPE; race so we report the real cause.
  await Promise.race([Promise.all([pump, exited]), spawnErr]);

  return {
    outPath,
    width,
    height,
    fps,
    frameCount,
    durationSec: frameCount / fps,
  };
}
