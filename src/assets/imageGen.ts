/**
 * Text→image generator backed by an OpenAI-compatible HTTP endpoint (overridable for a local /
 * self-hosted model so budget-conscious dev + CI never need a paid API). Returns PNG bytes; it
 * lives behind the `AssetGenerator` seam, so its (non-deterministic) output is frozen by the
 * content-addressed asset store and the renderer only ever sees frozen bytes.
 */

import type { AssetGenerator, AssetRequest } from "./provider.js";
import { PlaceholderImageGenerator } from "./generators.js";

type FetchFn = typeof fetch;

export interface HttpImageGeneratorOptions {
  apiKey: string;
  /** Full images endpoint. Default OpenAI's `/v1/images/generations`. */
  apiUrl?: string;
  /** Model id — also part of the generator id, so different models cache-key distinctly. */
  model?: string;
  /** Output size, e.g. `"512x512"`. */
  size?: string;
  /** Forward the request `seed` in the body (for SD-compatible endpoints; OpenAI rejects it). Default false. */
  forwardSeed?: boolean;
  /** Injected fetch (for tests). Defaults to the global `fetch`. */
  fetchFn?: FetchFn;
}

export class HttpImageGenerator implements AssetGenerator {
  readonly id: string;
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly size: string;
  private readonly forwardSeed: boolean;
  private readonly fetchFn: FetchFn;

  constructor(opts: HttpImageGeneratorOptions) {
    this.apiKey = opts.apiKey;
    this.apiUrl = opts.apiUrl ?? "https://api.openai.com/v1/images/generations";
    this.model = opts.model ?? "gpt-image-1";
    this.size = opts.size ?? "512x512";
    this.forwardSeed = opts.forwardSeed ?? false;
    this.fetchFn = opts.fetchFn ?? fetch;
    // size affects output, so it's part of the cache-keying id (different size → different asset).
    this.id = `http-image:${this.model}@${this.size}`;
  }

  // NOTE: the OpenAI /images/generations endpoint accepts neither reference images nor a seed, so
  // a capsule's `refs`/`seed` are NOT forwarded by default — they still scope the asset cache key
  // and provenance. Set `forwardSeed` for an SD-compatible endpoint to get reproducible output;
  // true reference-image (character-sheet) consistency needs an edits endpoint (out of scope here).
  async generate(req: AssetRequest): Promise<{ bytes: Buffer; contentType: string }> {
    const res = await this.fetchFn(this.apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: req.prompt,
        n: 1,
        size: this.size,
        response_format: "b64_json",
        ...(this.forwardSeed && req.seed !== undefined ? { seed: req.seed } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Image generation failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const item = json.data?.[0];
    if (item?.b64_json) return { bytes: Buffer.from(item.b64_json, "base64"), contentType: "image/png" };
    if (item?.url) {
      const img = await this.fetchFn(item.url);
      if (!img.ok) throw new Error(`Image fetch failed (${img.status})`);
      return { bytes: Buffer.from(await img.arrayBuffer()), contentType: img.headers.get("content-type") ?? "image/png" };
    }
    throw new Error("Image generation returned no image data");
  }
}

/**
 * Pick an image generator from the environment: the HTTP generator when an API key is set,
 * otherwise the free deterministic placeholder — so CI and offline/budget dev work without a key.
 * Env: `SHOWMAN_IMAGE_API_KEY` (or `OPENAI_API_KEY`), `SHOWMAN_IMAGE_API_URL`, `SHOWMAN_IMAGE_MODEL`,
 * `SHOWMAN_IMAGE_SIZE`.
 */
export function createImageGenerator(env: NodeJS.ProcessEnv = process.env): AssetGenerator {
  const apiKey = env.SHOWMAN_IMAGE_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) return new PlaceholderImageGenerator();
  return new HttpImageGenerator({
    apiKey,
    ...(env.SHOWMAN_IMAGE_API_URL ? { apiUrl: env.SHOWMAN_IMAGE_API_URL } : {}),
    ...(env.SHOWMAN_IMAGE_MODEL ? { model: env.SHOWMAN_IMAGE_MODEL } : {}),
    ...(env.SHOWMAN_IMAGE_SIZE ? { size: env.SHOWMAN_IMAGE_SIZE } : {}),
    ...(env.SHOWMAN_IMAGE_FORWARD_SEED === "1" ? { forwardSeed: true } : {}),
  });
}
