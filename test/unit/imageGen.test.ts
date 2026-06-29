import { describe, it, expect } from "vitest";
import { applyCapsule, type StyleCapsule } from "../../src/assets/styleCapsule.js";
import { HttpImageGenerator, createImageGenerator } from "../../src/assets/imageGen.js";
import { CachingAssetProvider } from "../../src/assets/provider.js";
import { MemoryAssetStore } from "../../src/assets/store.js";
import { PlaceholderImageGenerator } from "../../src/assets/generators.js";

// A tiny 1x1 PNG as base64 (valid, decodable).
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function fakeResponse(opts: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
  bytes?: Buffer;
  contentType?: string;
}): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => opts.json,
    text: async () => opts.text ?? "",
    arrayBuffer: async () =>
      opts.bytes ? opts.bytes.buffer.slice(opts.bytes.byteOffset, opts.bytes.byteOffset + opts.bytes.byteLength) : new ArrayBuffer(0),
    headers: { get: () => opts.contentType ?? "image/png" },
  } as unknown as Response;
}

describe("Style Capsule", () => {
  it("merges style direction, seed, id, and refs into a request", () => {
    const capsule: StyleCapsule = { id: "cap-1", style: "flat vector, soft pastel", seed: 7, refs: ["abc"] };
    const req = applyCapsule(capsule, "a happy apple ");
    expect(req.kind).toBe("image");
    expect(req.prompt).toBe("a happy apple — flat vector, soft pastel");
    expect(req.seed).toBe(7);
    expect(req.style).toBe("cap-1");
    expect(req.refs).toEqual(["abc"]);
    // Two prompts under one capsule share seed + style → cache-coherent art.
    expect(applyCapsule(capsule, "a blue whale").seed).toBe(7);
    expect(applyCapsule(capsule, "a blue whale").style).toBe("cap-1");
  });
});

describe("createImageGenerator (env selection)", () => {
  it("uses the placeholder offline and the HTTP generator when a key is set", () => {
    expect(createImageGenerator({} as NodeJS.ProcessEnv).id).toBe(new PlaceholderImageGenerator().id);
    const g = createImageGenerator({ SHOWMAN_IMAGE_API_KEY: "sk-test", SHOWMAN_IMAGE_MODEL: "test-model" } as NodeJS.ProcessEnv);
    expect(g.id).toBe("http-image:test-model");
  });
});

describe("HttpImageGenerator", () => {
  it("decodes a b64_json image and sends an authorized request", async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      sent = { url: String(url), init: init! };
      return fakeResponse({ json: { data: [{ b64_json: PNG_B64 }] } });
    }) as typeof fetch;
    const gen = new HttpImageGenerator({ apiKey: "sk-xyz", model: "m", fetchFn });
    const out = await gen.generate({ kind: "image", prompt: "a cat" });
    expect(out.contentType).toBe("image/png");
    expect(out.bytes.subarray(1, 4).toString()).toBe("PNG"); // PNG magic
    expect(sent!.url).toContain("/images/generations");
    expect((sent!.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-xyz");
    expect(JSON.parse(sent!.init.body as string).prompt).toBe("a cat");
  });

  it("falls back to fetching a url response", async () => {
    const png = Buffer.from(PNG_B64, "base64");
    const fetchFn = (async (url: string | URL | Request) => {
      if (String(url).includes("generations")) return fakeResponse({ json: { data: [{ url: "https://img/x.png" }] } });
      return fakeResponse({ bytes: png, contentType: "image/png" });
    }) as typeof fetch;
    const out = await new HttpImageGenerator({ apiKey: "k", fetchFn }).generate({ kind: "image", prompt: "x" });
    expect(out.bytes.length).toBe(png.length);
  });

  it("throws on a non-ok response and on empty data", async () => {
    const errFetch = (async () => fakeResponse({ ok: false, status: 429, text: "rate limited" })) as typeof fetch;
    await expect(new HttpImageGenerator({ apiKey: "k", fetchFn: errFetch }).generate({ kind: "image", prompt: "x" })).rejects.toThrow(
      /429/,
    );
    const emptyFetch = (async () => fakeResponse({ json: { data: [] } })) as typeof fetch;
    await expect(new HttpImageGenerator({ apiKey: "k", fetchFn: emptyFetch }).generate({ kind: "image", prompt: "x" })).rejects.toThrow(
      /no image data/,
    );
  });

  it("freezes generated art through the caching provider (generate-once + provenance)", async () => {
    const fetchFn = (async () => fakeResponse({ json: { data: [{ b64_json: PNG_B64 }] } })) as typeof fetch;
    const provider = new CachingAssetProvider(new HttpImageGenerator({ apiKey: "k", model: "m", fetchFn }), new MemoryAssetStore());
    const a = await provider.resolve(applyCapsule({ id: "c", style: "s", seed: 1 }, "apple"));
    const b = await provider.resolve(applyCapsule({ id: "c", style: "s", seed: 1 }, "apple"));
    expect(a.hash).toBe(b.hash);
    expect(provider.generated).toBe(1); // frozen — generated once
    expect(a.provenance?.model).toBe("http-image:m");
  });
});
