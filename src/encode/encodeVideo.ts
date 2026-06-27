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
import { FramePool } from "../render/framePool.js";
import { buildEncodeArgs } from "./ffmpegArgs.js";

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
  /**
   * Number of worker threads used to render frames in parallel (M1.1). 1 = render
   * inline on the encoder thread. Defaults to 1; set higher to saturate cores.
   * Frames are always written to FFmpeg in order regardless of concurrency.
   */
  concurrency?: number;
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
    concurrency = 1,
    onProgress,
  } = options;

  const args = buildEncodeArgs({ width, height, fps, crf, preset, pixelFormat, deterministic, outPath });

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
  stdin.on("error", () => {}); // swallow EPIPE if ffmpeg dies first; real cause comes via `exited`

  const pump = pumpFrames(spec, frameCount, concurrency, stdin, onProgress);

  // If ffmpeg dies mid-pump, the write would EPIPE; race so we report the real cause,
  // and always reap the child on failure so it can't leak.
  await settleFfmpeg(proc, Promise.all([pump, exited]), spawnErr);

  return {
    outPath,
    width,
    height,
    fps,
    frameCount,
    durationSec: frameCount / fps,
  };
}

/** Await ffmpeg work, but SIGKILL the child on any failure so processes never leak. */
async function settleFfmpeg(proc: ReturnType<typeof spawn>, work: Promise<unknown>, spawnErr: Promise<never>): Promise<void> {
  try {
    await Promise.race([work, spawnErr]);
  } catch (err) {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    throw err;
  }
}

/**
 * Render every frame and write it, in strict frame order, to a writable stream
 * (FFmpeg's stdin). Renders inline for concurrency<=1 or across a warm worker pool
 * otherwise — the engine produces frames as FFmpeg consumes them, overlapping
 * render and encode (the producer/consumer pipeline from the Concurrency pillar).
 */
async function pumpFrames(
  spec: SceneSpec,
  frameCount: number,
  concurrency: number,
  stdin: NodeJS.WritableStream,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const writeFrame = async (pixels: Uint8ClampedArray): Promise<void> => {
    const buf = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
    if (!stdin.write(buf)) await once(stdin, "drain");
  };

  if (concurrency <= 1) {
    for (let i = 0; i < frameCount; i++) {
      await writeFrame(renderFrame(spec, i).pixels);
      onProgress?.(i + 1, frameCount);
    }
  } else {
    const pool = new FramePool(spec, { concurrency });
    try {
      await pool.start();
      const chunkSize = Math.max(1, concurrency * 4);
      let done = 0;
      for (let start = 0; start < frameCount; start += chunkSize) {
        const indices: number[] = [];
        for (let i = start; i < Math.min(start + chunkSize, frameCount); i++) indices.push(i);
        const frames = await pool.render(indices); // sorted by index
        for (const f of frames) {
          await writeFrame(f.pixels);
          onProgress?.(++done, frameCount);
        }
      }
    } finally {
      await pool.close();
    }
  }
  stdin.end();
}

export interface HlsEncodeOptions {
  /** Directory to write the playlist + segments into. */
  outDir: string;
  /** Playlist filename. Default "index.m3u8". */
  playlistName?: string;
  /** Target segment length in seconds. Default 4. */
  segmentSeconds?: number;
  crf?: number;
  preset?: string;
  ffmpegPath?: string;
  concurrency?: number;
  onProgress?: (framesDone: number, totalFrames: number) => void;
}

export interface HlsResult {
  playlistPath: string;
  dir: string;
  frameCount: number;
  durationSec: number;
}

/**
 * M6.3 — Encode to HLS (an .m3u8 playlist + .ts segments) for adaptive streaming of
 * longer videos. Frames render the same deterministic way and feed one FFmpeg pass
 * that segments the output.
 */
export async function encodeSceneToHls(spec: SceneSpec, options: HlsEncodeOptions): Promise<HlsResult> {
  const { width, height, fps } = spec;
  const frameCount = totalFrames(fps, spec.duration);
  const {
    outDir,
    playlistName = "index.m3u8",
    segmentSeconds = 4,
    crf = 20,
    preset = "veryfast",
    ffmpegPath = "ffmpeg",
    concurrency = 1,
    onProgress,
  } = options;

  const { mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(outDir, { recursive: true });
  const playlistPath = join(outDir, playlistName);

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
    "-pix_fmt", "yuv420p",
    "-g", String(Math.max(1, Math.round(fps * segmentSeconds))),
    "-hls_time", String(segmentSeconds),
    "-hls_playlist_type", "vod",
    "-hls_segment_filename", join(outDir, "seg_%03d.ts"),
    "-f", "hls",
    playlistPath,
  ];

  const proc = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr?.on("data", (c: Buffer) => {
    stderr += c.toString();
    if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
  });
  const spawnErr = new Promise<never>((_, reject) => {
    proc.on("error", (err) => reject(new Error(`Failed to start ffmpeg ("${ffmpegPath}"): ${err.message}`)));
  });
  const exited = new Promise<void>((resolve, reject) => {
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg HLS exited with code ${code}.\n${stderr.slice(-2000)}`))));
  });
  if (!proc.stdin) throw new Error("ffmpeg stdin unavailable");
  proc.stdin.on("error", () => {});
  const pump = pumpFrames(spec, frameCount, concurrency, proc.stdin, onProgress);
  await settleFfmpeg(proc, Promise.all([pump, exited]), spawnErr);

  return { playlistPath, dir: outDir, frameCount, durationSec: frameCount / fps };
}

export interface StreamEncodeOptions {
  crf?: number;
  preset?: string;
  pixelFormat?: string;
  ffmpegPath?: string;
  concurrency?: number;
  onProgress?: (framesDone: number, totalFrames: number) => void;
}

/**
 * M2.1 — Streaming encode: pipe a fragmented MP4 to `out` as frames render, so a
 * player can begin playback before the render finishes. The response body *is* the
 * video. Resolves when encoding completes (the stream has been fully written).
 */
export async function encodeSceneToStream(
  spec: SceneSpec,
  out: NodeJS.WritableStream,
  options: StreamEncodeOptions = {},
): Promise<EncodeResult> {
  const { width, height, fps } = spec;
  const frameCount = totalFrames(fps, spec.duration);
  const {
    crf = 20,
    preset = "veryfast",
    pixelFormat = "yuv420p",
    ffmpegPath = "ffmpeg",
    concurrency = 1,
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
    // Fragmented MP4 so bytes are playable as they arrive (no moov-at-end seek).
    "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4",
    "pipe:1",
  ];

  const proc = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });

  let stderr = "";
  proc.stderr?.on("data", (c: Buffer) => {
    stderr += c.toString();
    if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
  });

  const spawnErr = new Promise<never>((_, reject) => {
    proc.on("error", (err) => reject(new Error(`Failed to start ffmpeg ("${ffmpegPath}"): ${err.message}`)));
  });
  const exited = new Promise<void>((resolve, reject) => {
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}.\n${stderr.slice(-2000)}`))));
  });

  // Pipe encoded bytes to the consumer, respecting backpressure (pipe pauses ffmpeg
  // stdout when `out` is slow). Don't end `out` — the caller owns it (e.g. the HTTP
  // response). If the consumer errors (client disconnects), kill ffmpeg.
  proc.stdout?.pipe(out, { end: false });
  out.on("error", () => {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  });

  if (!proc.stdin) throw new Error("ffmpeg stdin unavailable");
  proc.stdin.on("error", () => {});
  const pump = pumpFrames(spec, frameCount, concurrency, proc.stdin, onProgress);
  await settleFfmpeg(proc, Promise.all([pump, exited]), spawnErr);

  return { outPath: "", width, height, fps, frameCount, durationSec: frameCount / fps };
}
