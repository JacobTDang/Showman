/**
 * Image registry — decoded raster images for the `image` node. Decoding is async (loadImage),
 * but the renderer is a sync pure function, so images are pre-decoded ONCE into this module-level
 * registry (the same pattern as pre-registered fonts) and the frame loop only does sync drawImage.
 * Frozen bytes in → identical pixels out, so determinism holds.
 */

import { loadImage, type Image } from "@napi-rs/canvas";
import type { SceneSpec, Node } from "../spec/types.js";
import type { AssetStore } from "../assets/store.js";

const registry = new Map<string, Image>();

export function registerImage(key: string, img: Image): void {
  registry.set(key, img);
}
export function getRegisteredImage(key: string): Image | undefined {
  return registry.get(key);
}
export function clearImageRegistry(): void {
  registry.clear();
}

function collectSrcs(nodes: Node[], out: Set<string>): void {
  for (const n of nodes) {
    if (n.type === "image" && typeof n.src === "string") out.add(n.src);
    else if (n.type === "group" && Array.isArray(n.children)) collectSrcs(n.children, out);
  }
}

/** Decode a `data:` URI's payload (base64 or percent-encoded). */
function parseDataUri(src: string): Buffer | null {
  const comma = src.indexOf(",");
  if (comma < 0) return null;
  const meta = src.slice(5, comma); // between "data:" and ","
  const payload = src.slice(comma + 1);
  try {
    return /;base64/i.test(meta) ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  } catch {
    return null;
  }
}

async function bytesForSrc(src: string, store?: AssetStore): Promise<Buffer | null> {
  // Only a `data:` URI or a content-addressed asset hash — NEVER an arbitrary filesystem path,
  // since specs are untrusted (reading host files would be an info-disclosure vector).
  if (src.startsWith("data:")) return parseDataUri(src);
  if (store && (await store.has(src))) return store.get(src);
  return null;
}

/**
 * Decode every image referenced by the scene into the registry (idempotent; skips already-loaded
 * and undecodable sources). Call once before rendering frames. `src` may be a `data:` URI, an
 * asset hash (resolved via `store`), or a local file path.
 */
export async function prepareImages(spec: SceneSpec, opts: { store?: AssetStore } = {}): Promise<void> {
  const srcs = new Set<string>();
  collectSrcs(spec.nodes, srcs);
  for (const src of srcs) {
    if (registry.has(src)) continue;
    const bytes = await bytesForSrc(src, opts.store);
    if (!bytes) continue;
    try {
      registry.set(src, await loadImage(bytes));
    } catch {
      /* undecodable bytes — leave unregistered; the node renders nothing */
    }
  }
}

/**
 * Freeze asset-hash image srcs into self-contained `data:` URIs (bytes pulled from the store),
 * so the spec carries its assets and renders identically on the main thread AND in worker
 * threads (which have no store). Run once before encoding; returns a new spec.
 */
export async function inlineAssets(spec: SceneSpec, store: AssetStore): Promise<SceneSpec> {
  const inlineNode = async (n: Node): Promise<Node> => {
    if (n.type === "image" && typeof n.src === "string" && !n.src.startsWith("data:") && (await store.has(n.src))) {
      const [meta, bytes] = await Promise.all([store.stat(n.src), store.get(n.src)]);
      return { ...n, src: `data:${meta?.contentType ?? "image/png"};base64,${bytes.toString("base64")}` };
    }
    if (n.type === "group" && Array.isArray(n.children)) return { ...n, children: await Promise.all(n.children.map(inlineNode)) };
    return n;
  };
  return { ...spec, nodes: await Promise.all(spec.nodes.map(inlineNode)) };
}
