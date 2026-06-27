import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSceneToFile } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";

const execFileAsync = promisify(execFile);
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "out", "__test__");

/** Probe a video file's stream/format info via ffprobe. */
async function ffprobe(file: string): Promise<{ width: number; height: number; frames: number; codec: string; pixFmt: string; duration: number }> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-count_frames",
    "-show_entries", "stream=width,height,nb_read_frames,codec_name,pix_fmt",
    "-show_entries", "format=duration",
    "-of", "json",
    file,
  ]);
  const j = JSON.parse(stdout);
  const s = j.streams[0];
  return {
    width: Number(s.width),
    height: Number(s.height),
    frames: Number(s.nb_read_frames),
    codec: String(s.codec_name),
    pixFmt: String(s.pix_fmt),
    duration: Number(j.format.duration),
  };
}

async function hasTool(tool: string): Promise<boolean> {
  try {
    await execFileAsync(tool, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

function movingRectScene(): SceneSpec {
  return {
    specVersion: 1,
    width: 200,
    height: 100,
    fps: 10,
    duration: 0.6, // 6 frames
    background: "#ffffff",
    nodes: [
      {
        id: "slider",
        type: "rect",
        x: 10,
        y: 40,
        width: 20,
        height: 20,
        fill: "red",
        tracks: [{ property: "x", keyframes: [{ t: 0, value: 10 }, { t: 0.6, value: 150 }] }],
      },
    ],
  };
}

let ffmpegAvailable = false;
let ffprobeAvailable = false;

beforeAll(async () => {
  [ffmpegAvailable, ffprobeAvailable] = await Promise.all([hasTool("ffmpeg"), hasTool("ffprobe")]);
  mkdirSync(outDir, { recursive: true });
});

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe("encodeSceneToFile (spec -> mp4)", () => {
  it("encodes a valid mp4 with correct dimensions, frame count, and duration", async () => {
    if (!ffmpegAvailable) return expect.unreachable("ffmpeg is required for the encoder");
    const out = join(outDir, "basic.mp4");
    const result = await encodeSceneToFile(movingRectScene(), { outPath: out, preset: "ultrafast" });

    expect(result.frameCount).toBe(6);
    expect(result.durationSec).toBeCloseTo(0.6, 6);
    expect(existsSync(out)).toBe(true);

    const buf = readFileSync(out);
    expect(buf.length).toBeGreaterThan(0);
    // mp4/ISO-BMFF: bytes 4..8 are the 'ftyp' box type.
    expect(buf.subarray(4, 8).toString("latin1")).toBe("ftyp");

    if (ffprobeAvailable) {
      const info = await ffprobe(out);
      expect(info.width).toBe(200);
      expect(info.height).toBe(100);
      expect(info.frames).toBe(6);
      expect(info.codec).toBe("h264");
      expect(info.pixFmt).toBe("yuv420p");
      expect(info.duration).toBeCloseTo(0.6, 1);
    }
  });

  it("deterministic mode produces byte-identical files across runs", async () => {
    if (!ffmpegAvailable) return expect.unreachable("ffmpeg is required for the encoder");
    const a = join(outDir, "det-a.mp4");
    const b = join(outDir, "det-b.mp4");
    await encodeSceneToFile(movingRectScene(), { outPath: a, deterministic: true });
    await encodeSceneToFile(movingRectScene(), { outPath: b, deterministic: true });
    expect(Buffer.compare(readFileSync(a), readFileSync(b))).toBe(0);
  });

  it("parallel encoding (concurrency>1) is byte-identical to inline encoding", async () => {
    if (!ffmpegAvailable) return expect.unreachable("ffmpeg is required for the encoder");
    const inline = join(outDir, "c1.mp4");
    const parallel = join(outDir, "c4.mp4");
    await encodeSceneToFile(movingRectScene(), { outPath: inline, deterministic: true, concurrency: 1 });
    await encodeSceneToFile(movingRectScene(), { outPath: parallel, deterministic: true, concurrency: 4 });
    expect(Buffer.compare(readFileSync(inline), readFileSync(parallel))).toBe(0);
  });

  it("reports progress for every frame, ending at (n, n)", async () => {
    if (!ffmpegAvailable) return expect.unreachable("ffmpeg is required for the encoder");
    const calls: Array<[number, number]> = [];
    await encodeSceneToFile(movingRectScene(), {
      outPath: join(outDir, "progress.mp4"),
      preset: "ultrafast",
      onProgress: (done, total) => calls.push([done, total]),
    });
    expect(calls.length).toBe(6);
    expect(calls[0]).toEqual([1, 6]);
    expect(calls[calls.length - 1]).toEqual([6, 6]);
  });

  it("rejects clearly when the ffmpeg binary cannot be started", async () => {
    await expect(
      encodeSceneToFile(movingRectScene(), {
        outPath: join(outDir, "nope.mp4"),
        ffmpegPath: "definitely-not-a-real-ffmpeg-binary",
      }),
    ).rejects.toThrow(/Failed to start ffmpeg/);
  });
});
