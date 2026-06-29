/**
 * Frozen Asset Store — content-addressed storage for binary assets (generated illustrations,
 * characters, B-roll, …). Generalizes the content-addressed TTS cache: an asset is keyed by the
 * SHA-256 of its bytes, so identical bytes dedupe and a stored asset is immutable. This is the
 * substrate that lets stochastic generators feed the deterministic engine — a model produces
 * bytes ONCE, they're frozen here by hash, and the renderer only ever composites frozen bytes.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type AssetKind = "image" | "audio" | "video" | "other";

/** Where an asset came from — recorded so a generated asset can be traced or re-generated. */
export interface Provenance {
  model?: string;
  prompt?: string;
  seed?: number;
  refs?: string[];
  createdAt?: number;
}

export interface AssetMeta {
  /** SHA-256 hex of the bytes — the content address. */
  hash: string;
  contentType: string;
  kind: AssetKind;
  bytes: number;
  provenance?: Provenance;
}

export interface PutOptions {
  contentType: string;
  kind?: AssetKind;
  provenance?: Provenance;
}

export interface AssetStore {
  put(bytes: Buffer, opts: PutOptions): Promise<AssetMeta>;
  get(hash: string): Promise<Buffer>;
  has(hash: string): Promise<boolean>;
  stat(hash: string): Promise<AssetMeta | null>;
}

/** The content address of some bytes (sha-256 hex). */
export function assetHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function metaOf(bytes: Buffer, opts: PutOptions): AssetMeta {
  return {
    hash: assetHash(bytes),
    contentType: opts.contentType,
    kind: opts.kind ?? "other",
    bytes: bytes.length,
    ...(opts.provenance ? { provenance: opts.provenance } : {}),
  };
}

/** In-memory store — for tests and ephemeral use. */
export class MemoryAssetStore implements AssetStore {
  private readonly blobs = new Map<string, Buffer>();
  private readonly metas = new Map<string, AssetMeta>();

  async put(bytes: Buffer, opts: PutOptions): Promise<AssetMeta> {
    const meta = metaOf(bytes, opts);
    if (!this.blobs.has(meta.hash)) {
      this.blobs.set(meta.hash, Buffer.from(bytes));
      this.metas.set(meta.hash, meta);
    }
    return this.metas.get(meta.hash)!;
  }
  async get(hash: string): Promise<Buffer> {
    const b = this.blobs.get(hash);
    if (!b) throw new Error(`Asset ${hash} not found`);
    return b;
  }
  async has(hash: string): Promise<boolean> {
    return this.blobs.has(hash);
  }
  async stat(hash: string): Promise<AssetMeta | null> {
    return this.metas.get(hash) ?? null;
  }
}

/** Disk store — bytes at `<dir>/<hash>`, metadata at `<dir>/<hash>.json`. Atomic, immutable. */
export class FileAssetStore implements AssetStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  /** Resolve a hash to its on-disk path — only a valid 64-char sha-256 hex (no path traversal). */
  private path(hash: string): string | null {
    return /^[0-9a-f]{64}$/.test(hash) ? join(this.dir, hash) : null;
  }
  async put(bytes: Buffer, opts: PutOptions): Promise<AssetMeta> {
    const meta = metaOf(bytes, opts);
    const p = this.path(meta.hash)!; // assetHash always produces a valid hex hash
    if (!existsSync(p)) {
      writeFileSync(p, bytes);
      writeFileSync(`${p}.json`, JSON.stringify(meta));
    }
    return meta;
  }
  async get(hash: string): Promise<Buffer> {
    const p = this.path(hash);
    if (!p || !existsSync(p)) throw new Error(`Asset ${hash} not found`);
    return readFileSync(p);
  }
  async has(hash: string): Promise<boolean> {
    const p = this.path(hash);
    return p ? existsSync(p) : false;
  }
  async stat(hash: string): Promise<AssetMeta | null> {
    const p = this.path(hash);
    return p && existsSync(`${p}.json`) ? (JSON.parse(readFileSync(`${p}.json`, "utf8")) as AssetMeta) : null;
  }
}
