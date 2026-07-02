import { hasFfmpeg } from "../helpers.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RenderService,
  LocalObjectStorage,
  SilentTtsProvider,
  RuleBasedModeration,
  buildCountingLesson,
  interaction,
} from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";

const execFileAsync = promisify(execFile);
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

describe("narration fit + cost/farm guards", () => {
  const sceneWith = (duration: number, segments: { t: number; text: string }[]): SceneSpec => ({
    specVersion: 1,
    width: 64,
    height: 64,
    fps: 10,
    duration,
    background: "#fff",
    nodes: [{ id: "t", type: "text", x: 5, y: 30, text: "hi", fontSize: 10, fill: "#000" }],
    narration: { segments },
  });

  it("fitNarration extends a too-short scene to fit the real speech", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const spec = sceneWith(1, [
      { t: 0, text: "one two three" },
      { t: 1.5, text: "four five six seven eight nine" },
    ]);
    const r = await service.render(spec, { fitNarration: true, deterministic: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.durationSec).toBeGreaterThan(1); // grew past the authored 1s to fit the narration
  });

  it("rejects a fitNarration scene whose fitted duration blows past the frame/duration limits", async () => {
    const r = await service.render(sceneWith(1, [{ t: 1e9, text: "boom" }]), { fitNarration: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect("errors" in r && r.errors[0]?.code).toBe("LIMIT_EXCEEDED");
  });

  it("enforces the TTS character cost guard before any synthesis (incl. the measure pass)", async () => {
    const big = "word ".repeat(5000); // 25000 chars > the 20000 guard
    await expect(service.render(sceneWith(2, [{ t: 0, text: big }]), { fitNarration: true })).rejects.toThrow(/cost guard/);
  });
});

describe("interaction sidecar", () => {
  const withQuiz = (): SceneSpec => ({
    specVersion: 1,
    width: 64,
    height: 64,
    fps: 10,
    duration: 2,
    background: "#fff",
    nodes: [{ id: "t", type: "text", x: 5, y: 30, text: "hi", fontSize: 10, fill: "#000" }],
    interactions: interaction.interactionTrack(
      interaction.pausePrompt({ id: "p1", t: 0.5, prompt: "Predict!" }),
      interaction.mcq({ id: "q1", t: 1, prompt: "2+2?", choices: ["3", "4"], answer: 1, explanation: "It's 4." }),
    ),
  });

  it("emits interactions.json alongside the video", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const r = await service.render(withQuiz(), { deterministic: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.interactions?.key).toMatch(/\.interactions\.json$/);
    const track = JSON.parse((await storage.get(r.interactions!.key)).toString("utf8"));
    expect(track.cues.map((c: { id: string }) => c.id).sort()).toEqual(["p1", "q1"]);
  });

  it("fails fast on an invalid interaction track (before encoding)", async () => {
    const bad: SceneSpec = {
      ...withQuiz(),
      interactions: { cues: [interaction.mcq({ id: "x", t: 1, prompt: "?", choices: ["a", "b"], answer: 9 })] },
    };
    await expect(service.render(bad)).rejects.toThrow(/Invalid interactions/);
  });
});
