/**
 * A deterministic placeholder image generator — derives a color + initials from the prompt and
 * draws a labeled card. It stands in for a real text→image model (FLUX / Imagen / …) so the
 * generate-then-freeze pipeline can be tested and demoed without an external API. Same request →
 * identical PNG bytes, so it's content-addressable like a real (frozen) generation.
 */

import { createCanvas } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import type { AssetGenerator, AssetRequest } from "./provider.js";

export class PlaceholderImageGenerator implements AssetGenerator {
  readonly id = "placeholder-v1";
  constructor(private readonly size = 256) {}

  generate(req: AssetRequest): Promise<{ bytes: Buffer; contentType: string }> {
    const h = createHash("sha256")
      .update(`${req.prompt}|${req.seed ?? 0}|${req.style ?? ""}`)
      .digest();
    const hue = Math.round((h[0]! / 255) * 360);
    const c = createCanvas(this.size, this.size);
    const ctx = c.getContext("2d");
    ctx.fillStyle = `hsl(${hue}, 60%, 72%)`;
    ctx.fillRect(0, 0, this.size, this.size);
    ctx.fillStyle = `hsl(${hue}, 55%, 32%)`;
    ctx.font = `bold ${Math.round(this.size / 4)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const initials =
      req.prompt
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("") || "?";
    ctx.fillText(initials, this.size / 2, this.size / 2);
    return Promise.resolve({ bytes: c.toBuffer("image/png"), contentType: "image/png" });
  }
}
