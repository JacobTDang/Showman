import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RenderService, LocalObjectStorage, SilentTtsProvider, RuleBasedModeration, buildCountingLesson } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";

const execFileAsync = promisify(execFile);
async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}
async function audioStreams(file: string): Promise<{ codec: string; duration: number }[]> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a",
    "-show_entries",
    "stream=codec_name,duration",
    "-of",
    "json",
    file,
  ]);
  const j = JSON.parse(stdout) as { streams?: { codec_name: string; duration: string }[] };
  return (j.streams ?? []).map((s) => ({ codec: s.codec_name, duration: Number(s.duration) }));
}

let dataDir: string;
let service: RenderService;
let storage: LocalObjectStorage;
let ffmpeg = false;

beforeAll(async () => {
  ffmpeg = await hasFfmpeg();
  dataDir = mkdtempSync(join(tmpdir(), "showman-lesson-"));
  storage = new LocalObjectStorage(join(dataDir, "objects"));
  service = new RenderService({
    storage,
    workDir: join(dataDir, "tmp"),
    tts: new SilentTtsProvider(),
    moderation: new RuleBasedModeration(),
  });
});
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("end-to-end lesson render (M5)", () => {
  it("renders a counting lesson with a muxed narration track and a caption sidecar", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const lesson = buildCountingLesson({ count: 3, topic: "apples", theme: "sunshine", width: 320, height: 180, fps: 10 });
    const result = await service.render(lesson, { deterministic: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.hasAudio).toBe(true);
    expect(result.captions).toBeDefined();

    // The mp4 actually carries an audio stream ~ the scene length.
    const out = join(dataDir, "lesson.mp4");
    writeFileSync(out, await storage.get(result.video.key));
    const streams = await audioStreams(out);
    expect(streams.length).toBe(1);
    expect(streams[0]!.codec).toBe("aac");
    expect(streams[0]!.duration).toBeGreaterThan(result.durationSec - 1.0);

    // Captions are valid WebVTT and mention the recap line.
    const vtt = (await storage.get(result.captions!.key)).toString("utf8");
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("We counted 3 apples!");

    // An SRT sidecar is emitted alongside the VTT.
    expect(result.captionsSrt).toBeDefined();
    const srt = (await storage.get(result.captionsSrt!.key)).toString("utf8");
    expect(srt).toContain("-->");
    expect(srt).toContain("We counted 3 apples!");
  });

  it("blocks an unsafe scene at the content-safety gate (release blocker)", async () => {
    const unsafe: SceneSpec = {
      specVersion: 1,
      width: 64,
      height: 64,
      fps: 5,
      duration: 1,
      background: "#fff",
      nodes: [{ id: "t", type: "text", x: 5, y: 30, text: "the gun is loud", fontSize: 16, fill: "#000" }],
    };
    const result = await service.render(unsafe);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("blocked" in result && result.blocked).toBe("content_safety");
  });

  it("lets the caller bypass the gate with moderate:false (e.g. post-human-approval)", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const scene: SceneSpec = {
      specVersion: 1,
      width: 64,
      height: 64,
      fps: 5,
      duration: 0.4,
      background: "#fff",
      nodes: [{ id: "t", type: "text", x: 5, y: 30, text: "a friendly ghost waves hello", fontSize: 12, fill: "#000" }],
    };
    const result = await service.render(scene, { moderate: false });
    expect(result.ok).toBe(true);
  });
});
