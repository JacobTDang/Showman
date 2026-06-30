/**
 * End-to-end test of the *production* worker entrypoint.
 *
 * Unlike briefToVideo.test.ts (which builds the server in-process), this boots the
 * real `src/service/worker.ts` as a separate OS process — exactly how the container
 * runs it — and drives it over real HTTP:
 *
 *   spawn worker → wait for it to listen → POST /v1/generate {brief}
 *     → fetch the returned /objects/<key> → assert a real ftyp MP4 → kill it.
 *
 * This is the in-CI equivalent of scripts/smoke-container.sh, minus Docker: it proves
 * the env-driven wiring in startWorker() (storage, render service, authoring agent,
 * port binding) actually serves a brief-to-MP4 request end to end. The child env has
 * the LLM keys stripped, so it deterministically uses the offline template author.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const workerEntry = join(repoRoot, "src", "service", "worker.ts");

async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

interface Worker {
  port: number;
  child: ChildProcess;
}

/** Spawn the production worker via tsx, wait until it logs the port it bound. */
function startWorker(dataDir: string): Promise<Worker> {
  // Strip LLM keys so createDefaultAuthor() picks the offline TemplateAuthor — no
  // network, fully deterministic. PORT=0 lets the OS pick a free port (no collisions).
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: "0", SHOWMAN_DATA_DIR: dataDir };
  delete env.OPENROUTER_API_KEY;
  delete env.ANTHROPIC_API_KEY;

  const child = spawn(process.execPath, ["--import", "tsx/esm", workerEntry], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise<Worker>((resolve, reject) => {
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`worker did not start in time.\nstdout:\n${out}\nstderr:\n${err}`));
    }, 30_000);

    child.stdout!.on("data", (c: Buffer) => {
      out += c.toString();
      const m = out.match(/listening on :(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ port: Number(m[1]), child });
      }
    });
    child.stderr!.on("data", (c: Buffer) => (err += c.toString()));
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`worker exited early (code ${code}).\nstdout:\n${out}\nstderr:\n${err}`));
    });
  });
}

function stopWorker(w: Worker | undefined): Promise<void> {
  if (!w || w.child.killed) return Promise.resolve();
  return new Promise<void>((resolve) => {
    w.child.on("exit", () => resolve());
    w.child.kill();
    // Belt and suspenders: don't hang teardown if the signal is missed.
    setTimeout(resolve, 3_000).unref?.();
  });
}

let ffmpeg = false;
let dataDir: string;
let worker: Worker | undefined;

beforeAll(async () => {
  ffmpeg = await hasFfmpeg();
  if (!ffmpeg) return; // render needs ffmpeg; the single test below skips without it.
  dataDir = mkdtempSync(join(tmpdir(), "showman-e2e-"));
  worker = await startWorker(dataDir);
}, 40_000);

afterAll(async () => {
  await stopWorker(worker);
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe("e2e: production worker process serves brief -> MP4 over HTTP", () => {
  it("boots the worker entrypoint and renders a fetchable MP4 from a plain-English brief", async () => {
    if (!ffmpeg) return expect.unreachable("ffmpeg required");
    const base = `http://127.0.0.1:${worker!.port}`;

    // Health first — the worker is already listening once it logged the port.
    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    expect(((await health.json()) as { ok: boolean }).ok).toBe(true);

    // The one atomic agent call: brief in, finished MP4 out, synchronously.
    const gen = await fetch(`${base}/v1/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief: "teach counting to three with stars" }),
    });
    expect(gen.status).toBe(200);
    const out = (await gen.json()) as { videoUrl: string; video: { key: string }; durationSec: number; attempts: number };
    expect(out.video.key).toBeTruthy();
    expect(out.durationSec).toBeGreaterThan(0);
    expect(out.attempts).toBeGreaterThanOrEqual(1);

    // The returned reference fetches a real MP4 (bytes 4..8 are the "ftyp" box).
    const obj = await fetch(`${base}/objects/${out.video.key}`);
    expect(obj.status).toBe(200);
    expect(obj.headers.get("content-type")).toBe("video/mp4");
    const mp4 = Buffer.from(await obj.arrayBuffer());
    expect(mp4.subarray(4, 8).toString("latin1")).toBe("ftyp");
    expect(mp4.length).toBeGreaterThan(0);
  }, 60_000);
});
