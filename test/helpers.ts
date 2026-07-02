/** Shared test helpers. */

import type { RenderResult } from "../src/index.js";

export interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Sample a pixel from a RGBA buffer at (x, y). */
export function pixelAt(pixels: Uint8ClampedArray, width: number, x: number, y: number): Pixel {
  const i = (y * width + x) * 4;
  return { r: pixels[i]!, g: pixels[i + 1]!, b: pixels[i + 2]!, a: pixels[i + 3]! };
}

/** Sample a pixel from a render result. */
export function samplePixel(result: RenderResult, x: number, y: number): Pixel {
  return pixelAt(result.pixels, result.width, x, y);
}

/** True if a pixel is close to a target color within a per-channel tolerance. */
export function isColorNear(p: Pixel, target: Omit<Pixel, "a">, tol = 6): boolean {
  return Math.abs(p.r - target.r) <= tol && Math.abs(p.g - target.g) <= tol && Math.abs(p.b - target.b) <= tol;
}

/** Compare two RGBA buffers for exact equality. */
export function pixelsEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- external-tool gates (shared by the integration suites) ----

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** True if an external tool responds to `-version` (ffmpeg, ffprobe, …). */
export async function hasTool(tool: string): Promise<boolean> {
  try {
    await execFileAsync(tool, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/** True if ffmpeg is on PATH — the encoder dependency every render test gates on. */
export function hasFfmpeg(): Promise<boolean> {
  return hasTool("ffmpeg");
}
