/**
 * Object storage abstraction. Large outputs (video) are handed off by reference,
 * not bytes — "references, not bytes" from the plan's Communication pillar. The
 * local filesystem implementation backs dev/single-node; an S3-compatible adapter
 * (M6) drops in behind the same interface.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync, createReadStream } from "node:fs";
import { join, resolve } from "node:path";
import type { ReadStream } from "node:fs";

export interface StoredObject {
  key: string;
  /** A URL/handle the caller can use to fetch the bytes (never the bytes themselves). */
  url: string;
  size: number;
  contentType: string;
}

export interface ObjectStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<StoredObject>;
  has(key: string): Promise<boolean>;
  get(key: string): Promise<Buffer>;
  stat(key: string): Promise<StoredObject | null>;
  /** Local filesystem path for a key, if this backend is filesystem-backed. */
  localPath?(key: string): string;
  openRead?(key: string): ReadStream;
}

/** Deterministic content-addressed id: same bytes -> same key (free dedupe + idempotency). */
export function contentKey(prefix: string, bytes: Buffer, ext: string): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  return `${prefix}/${hash}.${ext}`;
}

/** Filesystem-backed object storage rooted at a directory. URLs are `file://`-style handles. */
export class LocalObjectStorage implements ObjectStorage {
  constructor(
    private readonly root: string,
    private readonly urlBase = "",
  ) {
    mkdirSync(root, { recursive: true });
  }

  localPath(key: string): string {
    return resolve(this.root, key);
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<StoredObject> {
    const path = this.localPath(key);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, bytes);
    return { key, url: this.urlFor(key), size: bytes.length, contentType };
  }

  async has(key: string): Promise<boolean> {
    return existsSync(this.localPath(key));
  }

  async get(key: string): Promise<Buffer> {
    return readFileSync(this.localPath(key));
  }

  async stat(key: string): Promise<StoredObject | null> {
    const path = this.localPath(key);
    if (!existsSync(path)) return null;
    const bytes = readFileSync(path);
    return { key, url: this.urlFor(key), size: bytes.length, contentType: guessContentType(key) };
  }

  openRead(key: string): ReadStream {
    return createReadStream(this.localPath(key));
  }

  private urlFor(key: string): string {
    return this.urlBase ? `${this.urlBase.replace(/\/$/, "")}/${key}` : `file://${this.localPath(key)}`;
  }
}

export function guessContentType(key: string): string {
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".vtt")) return "text/vtt";
  if (key.endsWith(".srt")) return "application/x-subrip";
  return "application/octet-stream";
}
