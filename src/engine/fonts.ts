/**
 * Pinned font registration.
 *
 * Font drift between machines is the top cause of "identical" frames differing, so
 * the engine renders text only with fonts it ships. M0 pins Nunito (a warm,
 * rounded, child-friendly family). M1 bakes the same files into the worker image.
 *
 * Registration is idempotent and lazy — done once per process, the first time a
 * render runs.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { GlobalFonts } from "@napi-rs/canvas";
import { REGISTERED_FONT_FAMILIES } from "../spec/schema.js";

/** Absolute path to the repo's `assets/` directory, resolved from this module. */
export function assetsDir(): string {
  // This file lives at <root>/src/engine/fonts.ts (tests, via tsx/vitest) or
  // <root>/dist/engine/fonts.js (built). Both are two levels under the repo root.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "assets");
}

/** The pinned font family name the engine uses by default. */
export const DEFAULT_FONT_FAMILY = "Nunito";

/** Maps each shippable family to its bundled font file (relative to assets/fonts/). */
const FONT_FILES: Readonly<Record<string, string>> = {
  Nunito: "Nunito-Variable.ttf",
};

/** True if `family` is one the engine ships and pins (and may therefore be rendered). */
export function isRegisteredFamily(family: string): boolean {
  return (REGISTERED_FONT_FAMILIES as readonly string[]).includes(family);
}

let registered = false;

/**
 * Register the pinned fonts exactly once per process. Safe to call repeatedly.
 * Throws if any bundled font is missing or fails to register — a silent
 * registration failure would let text fall back to host fonts and break
 * determinism, which is exactly what pinning exists to prevent.
 */
export function ensureFontsRegistered(): void {
  if (registered) return;
  for (const family of REGISTERED_FONT_FAMILIES) {
    const file = FONT_FILES[family];
    if (!file) throw new Error(`No bundled font file mapped for family "${family}".`);
    const fontPath = resolve(assetsDir(), "fonts", file);
    if (!existsSync(fontPath)) {
      throw new Error(
        `Pinned font not found at ${fontPath}. The engine refuses to render text with ` +
          `system fonts because that breaks cross-machine determinism.`,
      );
    }
    let ok: unknown;
    try {
      ok = GlobalFonts.registerFromPath(fontPath, family);
    } catch (err) {
      throw new Error(`Failed to register pinned font "${family}" from ${fontPath}: ${(err as Error).message}`);
    }
    if (!ok) {
      throw new Error(`registerFromPath reported failure for pinned font "${family}" (${fontPath}).`);
    }
  }
  registered = true;
}
