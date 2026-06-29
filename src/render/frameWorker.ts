/**
 * Frame-pool worker. Renders an assigned list of frame indices and ships the raw
 * RGBA buffers back to the pool. Because rendering is a pure function of
 * (spec, frame, seed), each worker is independent — no shared state, no locks.
 */

import { parentPort, workerData } from "node:worker_threads";
import { renderFrame } from "../engine/render.js";
import { prepareImages } from "../engine/imageRegistry.js";
import type { SceneSpec } from "../spec/types.js";

interface InitData {
  spec: SceneSpec;
}

interface RenderRequest {
  type: "render";
  indices: number[];
}

const { spec } = workerData as InitData;

parentPort?.on("message", (msg: RenderRequest) => {
  if (msg.type !== "render") return;
  const results: Array<{ index: number; width: number; height: number; buffer: ArrayBuffer }> = [];
  const transfers: ArrayBuffer[] = [];
  for (const index of msg.indices) {
    const frame = renderFrame(spec, index);
    // Copy into a tightly-owned ArrayBuffer we can transfer (zero-copy) to the pool.
    const copy = new Uint8Array(frame.pixels.length);
    copy.set(frame.pixels);
    results.push({ index, width: frame.width, height: frame.height, buffer: copy.buffer });
    transfers.push(copy.buffer);
  }
  parentPort?.postMessage({ type: "done", results }, transfers);
});

// Decode any images into this worker's registry, THEN signal readiness (data: URIs are
// self-contained, so the worker can prepare them without the asset store).
void prepareImages(spec).finally(() => parentPort?.postMessage({ type: "ready" }));
