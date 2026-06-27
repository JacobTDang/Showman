import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalObjectStorage, contentKey } from "../../src/index.js";

let dir: string;
let storage: LocalObjectStorage;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "showman-storage-"));
  storage = new LocalObjectStorage(join(dir, "objects"));
  // a secret file OUTSIDE the storage root, to prove traversal can't reach it
  writeFileSync(join(dir, "secret.txt"), "top secret");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("LocalObjectStorage", () => {
  it("puts and gets bytes by key", async () => {
    const ref = await storage.put("videos/a.mp4", Buffer.from("hello"), "video/mp4");
    expect(ref.size).toBe(5);
    expect((await storage.get("videos/a.mp4")).toString()).toBe("hello");
    expect(await storage.has("videos/a.mp4")).toBe(true);
    expect((await storage.stat("videos/a.mp4"))?.contentType).toBe("video/mp4");
  });

  it("returns null/false for missing keys", async () => {
    expect(await storage.stat("videos/missing.mp4")).toBeNull();
    expect(await storage.has("videos/missing.mp4")).toBe(false);
  });

  it("rejects path-traversal keys (cannot escape the storage root)", async () => {
    const evil = "../../secret.txt";
    expect(() => storage.localPath(evil)).toThrow(/path traversal/);
    expect(await storage.stat(evil)).toBeNull(); // served as not-found, not 500
    expect(await storage.has(evil)).toBe(false);
    expect(() => storage.localPath("..\\..\\secret.txt")).toThrow();
  });

  it("contentKey is content-addressed and stable", () => {
    const a = contentKey("videos", Buffer.from("x"), "mp4");
    const b = contentKey("videos", Buffer.from("x"), "mp4");
    expect(a).toBe(b);
    expect(a).toMatch(/^videos\/[0-9a-f]{32}\.mp4$/);
  });
});
