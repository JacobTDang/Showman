/**
 * Shard segments + assembly (M3).
 *
 * A worker renders its frame range to a *segment*: the concatenated raw RGBA of
 * those frames, gzipped. Segments are intermediate, so their compressed bytes need
 * not be deterministic — only the frames inside them. The assembler streams the
 * decompressed segments, in shard order, through one FFmpeg pass. Because that pass
 * uses the exact args the monolithic encoder uses, a distributed render and a
 * single-process render of the same spec are byte-identical.
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { gzipSync, gunzipSync } from "node:zlib";
import { renderFrame } from "../engine/render.js";
import type { SceneSpec } from "../spec/types.js";
import { buildEncodeArgs } from "../encode/ffmpegArgs.js";

export interface SegmentMeta {
  frameStart: number;
  frameEnd: number;
  frameCount: number;
}

/** Render frames [frameStart, frameEnd) into a gzipped raw-RGBA segment. */
export function renderSegment(spec: SceneSpec, frameStart: number, frameEnd: number): { bytes: Buffer; meta: SegmentMeta } {
  const buffers: Buffer[] = [];
  for (let i = frameStart; i < frameEnd; i++) {
    const px = renderFrame(spec, i).pixels;
    buffers.push(Buffer.from(px.buffer, px.byteOffset, px.byteLength));
  }
  const raw = Buffer.concat(buffers);
  return {
    bytes: gzipSync(raw),
    meta: { frameStart, frameEnd, frameCount: frameEnd - frameStart },
  };
}

/** Decompress a segment back to raw RGBA bytes. */
export function decodeSegment(bytes: Buffer): Buffer {
  return gunzipSync(bytes);
}

export interface AssembleOptions {
  width: number;
  height: number;
  fps: number;
  deterministic?: boolean;
  crf?: number;
  preset?: string;
  ffmpegPath?: string;
}

/**
 * Concatenate ordered raw-RGBA segments through a single FFmpeg encode -> mp4.
 * `getSegment(i)` returns the decompressed raw bytes for shard `i`, fetched lazily
 * so we don't hold the whole video in memory at once.
 */
export async function assembleSegments(
  segmentCount: number,
  getSegment: (shardId: number) => Promise<Buffer>,
  outPath: string,
  options: AssembleOptions,
): Promise<void> {
  const { width, height, fps, deterministic = false, crf, preset, ffmpegPath = "ffmpeg" } = options;
  const args = buildEncodeArgs({ width, height, fps, deterministic, ...(crf !== undefined ? { crf } : {}), ...(preset ? { preset } : {}), outPath });

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
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}.\n${stderr.slice(-2000)}`))));
  });

  const stdin = proc.stdin;
  if (!stdin) throw new Error("ffmpeg stdin unavailable");
  stdin.on("error", () => {});

  const pump = (async () => {
    for (let shardId = 0; shardId < segmentCount; shardId++) {
      const raw = await getSegment(shardId);
      if (!stdin.write(raw)) await once(stdin, "drain");
    }
    stdin.end();
  })();

  try {
    await Promise.race([Promise.all([pump, exited]), spawnErr]);
  } catch (err) {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    throw err;
  }
}
