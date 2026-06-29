import { describe, it, expect } from "vitest";
import {
  renderFrame,
  validateScene,
  SPEC_VERSION,
  THEMES,
  getTheme,
  monoFamily,
  parseColor,
  lighten,
  darken,
  mix,
  withAlpha,
  contrastRatio,
  relativeLuminance,
  rgbToHsl,
  readableOn,
  rgbaToHex,
  REGISTERED_FONT_FAMILIES,
  ensureFontsRegistered,
  isRegisteredFamily,
} from "../../src/index.js";
import type { SceneSpec, Node } from "../../src/index.js";
import { samplePixel, pixelsEqual } from "../helpers.js";

function scene(node: Node, w = 220, h = 170): SceneSpec {
  return { specVersion: SPEC_VERSION, width: w, height: h, fps: 1, duration: 1, seed: 1, background: "#ffffff", nodes: [node] };
}
function rowHasInk(r: ReturnType<typeof renderFrame>, y: number): boolean {
  for (let x = 0; x < r.width; x++) {
    const p = samplePixel(r, x, y);
    if (p.r < 100 && p.g < 100 && p.b < 100) return true;
  }
  return false;
}
function lowestInkRow(r: ReturnType<typeof renderFrame>): number {
  for (let y = r.height - 1; y >= 0; y--) if (rowHasInk(r, y)) return y;
  return -1;
}

describe("pinned fonts", () => {
  it("registers all five families (children + adult) without throwing", () => {
    expect(() => ensureFontsRegistered()).not.toThrow();
    for (const fam of ["Nunito", "Fredoka", "Inter", "Source Serif 4", "JetBrains Mono"]) {
      expect((REGISTERED_FONT_FAMILIES as readonly string[]).includes(fam)).toBe(true);
      expect(isRegisteredFamily(fam)).toBe(true);
    }
    expect(isRegisteredFamily("Comic Sans MS")).toBe(false);
  });

  it("renders text in a newly-pinned family", () => {
    const r = renderFrame(
      scene({ id: "t", type: "text", x: 10, y: 60, text: "Code()", fontFamily: "JetBrains Mono", fontSize: 40, fill: "#000000" }),
      0,
    );
    let inked = false;
    for (let y = 40; y < 120 && !inked; y++) inked = rowHasInk(r, y);
    expect(inked).toBe(true);
  });
});

describe("color math", () => {
  it("computes WCAG contrast + luminance", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#3a3a3a", "#3a3a3a")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });
  it("lightens, darkens, mixes, and sets alpha", () => {
    expect(lighten("#000000", 1)).toBe("#ffffff");
    expect(darken("#ffffff", 1)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(withAlpha("#ff0000", 0.5)).toBe("#ff000080");
    expect(rgbaToHex(parseColor("#12345678")!)).toBe("#12345678");
  });
  it("derives HSL and a readable foreground", () => {
    const hsl = rgbToHsl(parseColor("#ff0000")!);
    expect(hsl.h).toBeCloseTo(0, 1);
    expect(hsl.s).toBeCloseTo(100, 1);
    expect(hsl.l).toBeCloseTo(50, 1);
    expect(readableOn("#0f172a")).toBe("#ffffff"); // dark bg → light text
    expect(readableOn("#ffffff")).toBe("#000000");
  });
});

describe("adult themes", () => {
  it("ships dark + light professional themes with parseable, sufficiently-contrasting palettes", () => {
    for (const name of ["slate", "daylight", "editorial"]) {
      const t = THEMES[name]!;
      expect(t).toBeDefined();
      for (const c of Object.values(t.palette).flat()) expect(parseColor(c as string)).not.toBeNull();
      // body text on the background should be legible (WCAG AA large-text ≈ 3:1, we beat it comfortably)
      expect(contrastRatio(t.palette.text, t.palette.bg)).toBeGreaterThan(4.5);
    }
    expect(getTheme("slate").mode).toBe("dark");
    expect(monoFamily(getTheme("slate"))).toBe("JetBrains Mono");
  });
});

describe("multi-line text", () => {
  const long = "the quick brown fox jumps over the lazy dog again and again and again";
  it("wraps to maxWidth (ink reaches further down than a single line)", () => {
    const single = renderFrame(scene({ id: "t", type: "text", x: 8, y: 10, text: long, fontSize: 20, fill: "#000000" }), 0);
    const wrapped = renderFrame(scene({ id: "t", type: "text", x: 8, y: 10, text: long, fontSize: 20, fill: "#000000", maxWidth: 90 }), 0);
    expect(pixelsEqual(single.pixels, wrapped.pixels)).toBe(false);
    // single line stays near the top; wrapping flows several lines further down.
    expect(lowestInkRow(wrapped)).toBeGreaterThan(lowestInkRow(single) + 30);
  });
  it("breaks on explicit newlines", () => {
    const r = renderFrame(scene({ id: "t", type: "text", x: 8, y: 10, text: "Alpha\nBeta\nGamma", fontSize: 22, fill: "#000000" }), 0);
    expect(rowHasInk(r, 15)).toBe(true);
    expect(rowHasInk(r, 70)).toBe(true); // third line, well below the first
  });
  it("letterSpacing changes layout", () => {
    const tight = renderFrame(scene({ id: "t", type: "text", x: 8, y: 40, text: "SPACED", fontSize: 36, fill: "#000000" }), 0);
    const loose = renderFrame(
      scene({ id: "t", type: "text", x: 8, y: 40, text: "SPACED", fontSize: 36, fill: "#000000", letterSpacing: 10 }),
      0,
    );
    expect(pixelsEqual(tight.pixels, loose.pixels)).toBe(false);
  });
  it("validates the new props", () => {
    const bad = scene({ id: "t", type: "text", x: 0, y: 0, text: "x", maxWidth: -5, lineHeight: 0 } as Node);
    const res = validateScene(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.property === "maxWidth")).toBe(true);
    expect(res.errors.some((e) => e.property === "lineHeight")).toBe(true);
  });
});
