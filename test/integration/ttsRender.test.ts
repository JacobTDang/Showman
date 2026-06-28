/**
 * Cloud-TTS render path, end-to-end, with the network MOCKED (a fake fetch returning
 * raw 24 kHz PCM). Proves a real provider (OpenAI) flows through the cache → narration
 * assembly → ffmpeg mux into an mp4 carrying an AAC audio stream, with captions — and
 * that frame rendering is unaffected (determinism is covered by the golden suite).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RenderService,
  LocalObjectStorage,
  RuleBasedModeration,
  OpenAiTtsProvider,
  CachingTtsProvider,
  buildCountingLesson,
} from "../../src/index.js";

const execFileAsync = promisify(execFile);
async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}
async function audioCodecs(file: string): Promise<string[]> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a",
    "-show_entries",
    "stream=codec_name",
    "-of",
    "json",
    file,
  ]);
  const j = JSON.parse(stdout) as { streams?: { codec_name: string }[] };
  return (j.streams ?? []).map((s) => s.codec_name);
}

/** A fake OpenAI `/audio/speech` fetch: returns 0.1s of 24 kHz PCM, counting calls. */
function fakeOpenAi(): { state: { calls: number }; fetchImpl: typeof fetch } {
  const state = { calls: 0 };
  const fetchImpl = (async () => {
    state.calls++;
    const bytes = new Uint8Array(4800); // 2400 samples @ 24 kHz = 0.1s
    for (let i = 0; i < bytes.length; i += 2) bytes[i] = 0x20; // low-amplitude tone-ish
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer } as unknown as Response;
  }) as unknown as typeof fetch;
  return { state, fetchImpl };
}

let dataDir: string;
let storage: LocalObjectStorage;
let ffmpeg = false;

beforeAll(async () => {
  ffmpeg = await hasFfmpeg();
  dataDir = mkdtempSync(join(tmpdir(), "showman-ttsrender-"));
  storage = new LocalObjectStorage(join(dataDir, "objects"));
});
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("cloud TTS render (mocked network)", () => {
  it("renders a lesson with a real-provider audio track + caption sidecar", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const { state, fetchImpl } = fakeOpenAi();
    const tts = new CachingTtsProvider(new OpenAiTtsProvider({ apiKey: "test", fetchImpl, retryDelayMs: 0 }), {
      dir: join(dataDir, "tts-cache"),
    });
    const service = new RenderService({ storage, workDir: join(dataDir, "tmp"), tts, moderation: new RuleBasedModeration() });
    const lesson = buildCountingLesson({ count: 3, topic: "apples", theme: "ocean", width: 320, height: 180, fps: 10 });

    const r = await service.render(lesson, { deterministic: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hasAudio).toBe(true);
    expect(r.captions).toBeDefined();
    expect(state.calls).toBeGreaterThan(0); // the cloud provider actually ran

    const out = join(dataDir, "ttsrender.mp4");
    writeFileSync(out, await storage.get(r.video.key));
    expect(await audioCodecs(out)).toEqual(["aac"]);

    const vtt = (await storage.get(r.captions!.key)).toString("utf8");
    expect(vtt.startsWith("WEBVTT")).toBe(true);
  });
});
