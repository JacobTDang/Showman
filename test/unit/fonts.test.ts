import { describe, it, expect } from "vitest";
import { ensureFontsRegistered, isRegisteredFamily, REGISTERED_FONT_FAMILIES, DEFAULT_FONT_FAMILY, renderFrame } from "../../src/index.js";

describe("fonts", () => {
  it("registers the pinned fonts without throwing (and is idempotent)", () => {
    expect(() => {
      ensureFontsRegistered();
      ensureFontsRegistered();
    }).not.toThrow();
  });

  it("recognizes the pinned family and rejects unregistered ones", () => {
    expect(isRegisteredFamily(DEFAULT_FONT_FAMILY)).toBe(true);
    expect(isRegisteredFamily("Nunito")).toBe(true);
    expect(isRegisteredFamily("Arial")).toBe(false);
    expect(isRegisteredFamily("Comic Sans MS")).toBe(false);
  });

  it("default family is part of the registered set", () => {
    expect(REGISTERED_FONT_FAMILIES).toContain(DEFAULT_FONT_FAMILY);
  });

  it("bundled text fonts contain distinct common STEM glyphs instead of one tofu fallback", () => {
    const hashes = ["τ", "µ", "Ω", "π", "Δ", "₍", "²"].map((text) => {
      const frame = renderFrame(
        {
          specVersion: 1,
          width: 80,
          height: 80,
          fps: 1,
          duration: 1,
          background: "#ffffff",
          nodes: [
            { id: "glyph", type: "text", text, x: 40, y: 40, align: "center", baseline: "middle", fontSize: 42, fontFamily: "Inter" },
          ],
        },
        0,
      );
      return Buffer.from(frame.pixels).toString("base64");
    });
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
