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

/** Absolute path to the repo's `assets/` directory, resolved from this module. */
export function assetsDir(): string {
  // This file lives at <root>/src/engine/fonts.ts (tests, via tsx/vitest) or
  // <root>/dist/engine/fonts.js (built). Both are two levels under the repo root.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "assets");
}

/** The pinned font family name the engine uses by default. */
export const DEFAULT_FONT_FAMILY = "Nunito";

let registered = false;

/** Register the pinned fonts exactly once per process. Safe to call repeatedly. */
export function ensureFontsRegistered(): void {
  if (registered) return;
  const fontPath = resolve(assetsDir(), "fonts", "Nunito-Variable.ttf");
  if (!existsSync(fontPath)) {
    throw new Error(
      `Pinned font not found at ${fontPath}. The engine refuses to render text with ` +
        `system fonts because that breaks cross-machine determinism.`,
    );
  }
  GlobalFonts.registerFromPath(fontPath, DEFAULT_FONT_FAMILY);
  registered = true;
}
