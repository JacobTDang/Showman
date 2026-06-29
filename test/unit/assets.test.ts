import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { renderFrame, validateScene, prepareImages, inlineAssets, getRegisteredImage, clearImageRegistry } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { assetHash, MemoryAssetStore, FileAssetStore } from "../../src/assets/store.js";
import { CachingAssetProvider, type AssetGenerator, type AssetRequest } from "../../src/assets/provider.js";
import { samplePixel, isColorNear } from "../helpers.js";

function solidPngDataUri(color: string, size = 24): string {
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  return `data:image/png;base64,${c.toBuffer("image/png").toString("base64")}`;
}

describe("asset store", () => {
  it("content-addresses by bytes (sha-256)", () => {
    expect(assetHash(Buffer.from("hello"))).toBe(assetHash(Buffer.from("hello")));
    expect(assetHash(Buffer.from("a"))).not.toBe(assetHash(Buffer.from("b")));
  });

  it("MemoryAssetStore stores, reads, and dedupes", async () => {
    const store = new MemoryAssetStore();
    const meta = await store.put(Buffer.from("PNGBYTES"), {
      contentType: "image/png",
      kind: "image",
      provenance: { model: "m", prompt: "cat" },
    });
    expect(meta.hash).toBe(assetHash(Buffer.from("PNGBYTES")));
    expect(meta.kind).toBe("image");
    expect(meta.provenance?.prompt).toBe("cat");
    expect((await store.get(meta.hash)).toString()).toBe("PNGBYTES");
    expect(await store.has(meta.hash)).toBe(true);
    const again = await store.put(Buffer.from("PNGBYTES"), { contentType: "image/png" });
    expect(again.hash).toBe(meta.hash); // dedup
    await expect(store.get("nope")).rejects.toThrow();
  });

  it("FileAssetStore round-trips through disk", async () => {
    const store = new FileAssetStore(mkdtempSync(join(tmpdir(), "showman-assets-")));
    const meta = await store.put(Buffer.from("DISKBYTES"), { contentType: "image/png", kind: "image" });
    expect((await store.get(meta.hash)).toString()).toBe("DISKBYTES");
    expect((await store.stat(meta.hash))?.kind).toBe("image");
    expect(await store.has(meta.hash)).toBe(true);
  });
});

describe("CachingAssetProvider (generate-then-freeze)", () => {
  let runs: number;
  const gen: AssetGenerator = {
    id: "test-gen",
    generate(req: AssetRequest) {
      runs++;
      return Promise.resolve({ bytes: Buffer.from(`img:${req.prompt}:${req.seed ?? 0}`), contentType: "image/png" });
    },
  };
  beforeEach(() => (runs = 0));

  it("generates each distinct request once and freezes it", async () => {
    const p = new CachingAssetProvider(gen, new MemoryAssetStore());
    const a = await p.resolve({ kind: "image", prompt: "apple", seed: 1 });
    const b = await p.resolve({ kind: "image", prompt: "apple", seed: 1 }); // cache hit
    const c = await p.resolve({ kind: "image", prompt: "whale", seed: 1 });
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
    expect(runs).toBe(2); // apple generated once, whale once
    expect(p.generated).toBe(2);
    expect(a.provenance).toMatchObject({ model: "test-gen", prompt: "apple", seed: 1 });
  });
});

describe("image node", () => {
  beforeEach(() => clearImageRegistry());

  function scene(nodes: Node[], w = 60, h = 60): SceneSpec {
    return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
  }

  it("validates src / fit / dimensions", () => {
    const codes = (n: unknown) =>
      validateScene({ specVersion: 1, width: 50, height: 50, fps: 1, duration: 1, nodes: [n] }).errors.map((e) => e.code);
    expect(codes({ id: "i", type: "image" })).toContain("MISSING_FIELD"); // no src
    expect(codes({ id: "i", type: "image", src: "data:,", fit: "weird" })).toContain("INVALID_VALUE");
    expect(codes({ id: "i", type: "image", src: "data:,", width: -5 })).toContain("OUT_OF_RANGE");
  });

  it("draws a decoded image and renders nothing for an unresolved src", async () => {
    const spec = scene([{ id: "i", type: "image", x: 5, y: 5, width: 50, height: 50, src: solidPngDataUri("#e63946") }]);
    expect(validateScene(spec).valid).toBe(true);
    await prepareImages(spec);
    expect(isColorNear(samplePixel(renderFrame(spec, 0), 30, 30), { r: 230, g: 57, b: 70 })).toBe(true);

    const missing = scene([{ id: "m", type: "image", x: 5, y: 5, width: 50, height: 50, src: "unresolved-hash" }]);
    await prepareImages(missing);
    expect(() => renderFrame(missing, 0).toPNG()).not.toThrow();
    expect(isColorNear(samplePixel(renderFrame(missing, 0), 30, 30), { r: 255, g: 255, b: 255 })).toBe(true);
  });

  it("renders an image deterministically (byte-identical across renders)", async () => {
    const spec = scene([{ id: "i", type: "image", x: 5, y: 5, width: 50, height: 50, src: solidPngDataUri("#2a9d8f"), radius: 10 }]);
    await prepareImages(spec);
    expect(Buffer.compare(renderFrame(spec, 0).toPNG(), renderFrame(spec, 0).toPNG())).toBe(0);
  });

  it("prepareImages resolves an asset-hash src via the store", async () => {
    const store = new MemoryAssetStore();
    const c = createCanvas(8, 8);
    c.getContext("2d").fillStyle = "#1d6f72";
    c.getContext("2d").fillRect(0, 0, 8, 8);
    const meta = await store.put(c.toBuffer("image/png"), { contentType: "image/png", kind: "image" });
    const spec = scene([{ id: "i", type: "image", x: 5, y: 5, width: 50, height: 50, src: meta.hash }]);
    await prepareImages(spec, { store });
    expect(isColorNear(samplePixel(renderFrame(spec, 0), 30, 30), { r: 29, g: 111, b: 114 })).toBe(true);
  });
});

describe("asset security + freeze (review fixes)", () => {
  beforeEach(() => clearImageRegistry());

  it("never reads an arbitrary host file from a file-path src", () => {
    // A real, decodable PNG on disk must NOT be read by an untrusted spec.
    const file = join(mkdtempSync(join(tmpdir(), "showman-secret-")), "private.png");
    const c = createCanvas(8, 8);
    c.getContext("2d").fillStyle = "#000000";
    c.getContext("2d").fillRect(0, 0, 8, 8);
    writeFileSync(file, c.toBuffer("image/png"));
    return prepareImages({
      specVersion: 1,
      width: 20,
      height: 20,
      fps: 1,
      duration: 1,
      nodes: [{ id: "i", type: "image", src: file, width: 10, height: 10 }],
    }).then(() => {
      expect(getRegisteredImage(file)).toBeUndefined(); // file path was not read
    });
  });

  it("FileAssetStore rejects a traversal hash (no escape from the store dir)", async () => {
    const store = new FileAssetStore(mkdtempSync(join(tmpdir(), "showman-assets-")));
    expect(await store.has("../../../etc/passwd")).toBe(false);
    expect(await store.stat("../../x")).toBeNull();
    await expect(store.get("../../../etc/passwd")).rejects.toThrow();
    await expect(store.get("not-a-hash")).rejects.toThrow();
  });

  it("inlineAssets freezes an asset-hash src into a self-contained data: URI", async () => {
    const store = new MemoryAssetStore();
    const c = createCanvas(8, 8);
    c.getContext("2d").fillStyle = "#e63946";
    c.getContext("2d").fillRect(0, 0, 8, 8);
    const meta = await store.put(c.toBuffer("image/png"), { contentType: "image/png", kind: "image" });
    const spec: SceneSpec = {
      specVersion: 1,
      width: 60,
      height: 60,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [
        { id: "g", type: "group", x: 0, y: 0, children: [{ id: "i", type: "image", x: 5, y: 5, width: 50, height: 50, src: meta.hash }] },
      ],
    };
    const frozen = await inlineAssets(spec, store);
    const img = (frozen.nodes[0] as { children: { src: string }[] }).children[0]!;
    expect(img.src.startsWith("data:image/png;base64,")).toBe(true); // now self-contained
    // …and the frozen spec renders without the store (data: URI works in workers too).
    await prepareImages(frozen);
    expect(isColorNear(samplePixel(renderFrame(frozen, 0), 30, 30), { r: 230, g: 57, b: 70 })).toBe(true);
  });
});
