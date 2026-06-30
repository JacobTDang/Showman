import { describe, it, expect } from "vitest";
import { brand, getTheme, validateScene, renderFrame, SPEC_VERSION, relativeLuminance, contrastRatio } from "../../src/index.js";
import type { Node } from "../../src/index.js";

const { brandTheme, registerBrand, watermark, titleCard, lowerThird } = brand;

describe("brandTheme", () => {
  it("derives a full, legible palette from just name + primary", () => {
    const t = brandTheme({ name: "Acme", primary: "#6d28d9" });
    expect(t.palette.primary).toBe("#6d28d9");
    for (const k of ["bg", "primary", "secondary", "accent", "text", "muted"] as const) expect(typeof t.palette[k]).toBe("string");
    expect(t.palette.swatches.length).toBeGreaterThanOrEqual(4);
    expect(t.palette.swatches.length).toBe(6); // primary, accent, secondary + 3 fixed
    // default light theme resolves dark text on white — a known, near-maximal ratio
    expect(t.palette.text).toBe("#0f172a");
    expect(t.palette.bg).toBe("#ffffff");
    // text is readable on the (light, default) background
    expect(contrastRatio(t.palette.text, t.palette.bg)).toBeGreaterThan(7);
    expect(contrastRatio(t.palette.text, t.palette.bg)).toBeCloseTo(17.85, 1);
    // secondary is a distinct sibling of primary (direction depends on primary's lightness)
    expect(t.palette.secondary).not.toBe(t.palette.primary);
    expect(t.palette.accent).not.toBe(t.palette.primary);
  });
  it("honors dark mode and explicit overrides", () => {
    const dark = brandTheme({ name: "Night", primary: "#38bdf8", mode: "dark" });
    expect(relativeLuminance(dark.palette.bg)).toBeLessThan(0.1);
    expect(relativeLuminance(dark.palette.text)).toBeGreaterThan(0.5); // light text on dark
    const over = brandTheme({ name: "X", primary: "#111", accent: "#00ff00", bodyFont: "Nunito" });
    expect(over.palette.accent).toBe("#00ff00");
    expect(over.bodyFont).toBe("Nunito");
  });
  it("registerBrand makes the theme available to every builder via getTheme(name)", () => {
    registerBrand({ name: "TestCo", primary: "#0ea5e9" });
    expect(getTheme("TestCo").palette.primary).toBe("#0ea5e9");
  });
});

describe("brand review fixes", () => {
  it("titleCard keeps the title readable even for a light/saturated primary", () => {
    for (const primary of ["#fafafa", "#ffff00", "#ff0000", "#2563eb"]) {
      const tc = titleCard({ name: "B", primary }, { title: "Headline" });
      const title = tc.nodes.find((n) => n.id === "tc-title") as { fill?: string };
      expect(contrastRatio(title.fill!, tc.background as string)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("derives a distinct secondary/accent even for pure black/white primaries", () => {
    const black = brandTheme({ name: "K", primary: "#000000" });
    expect(black.palette.secondary).not.toBe("#000000");
    const white = brandTheme({ name: "W", primary: "#ffffff", mode: "dark" });
    expect(white.palette.accent).not.toBe("#ffffff");
  });
  it("registerBrand refuses to clobber a built-in theme", () => {
    expect(() => registerBrand({ name: "ocean", primary: "#ff0000" })).toThrow(/built-in/);
    expect(getTheme("ocean").palette.primary).not.toBe("#ff0000"); // untouched
  });
  it("falls back to a pinned font for an unregistered brand typeface (scene stays valid)", () => {
    const t = brandTheme({ name: "Mont", primary: "#2563eb", headingFont: "Montserrat", bodyFont: "Roboto" });
    expect(t.headingFont).toBe("Inter");
    const tc = titleCard({ name: "Mont2", primary: "#2563eb", headingFont: "Montserrat" }, { title: "Hi", subtitle: "x" });
    expect(validateScene(tc)).toMatchObject({ valid: true });
  });
});

describe("brand assets", () => {
  const kit = { name: "Acme", primary: "#6d28d9" };
  it("watermark is a wordmark by default and a sized image with a logo", () => {
    const word = watermark(kit, { width: 640, height: 360, position: "top-left" }) as {
      type: string;
      text?: string;
      align?: string;
      baseline?: string;
    };
    expect(word.type).toBe("text");
    expect(word.text).toBe("Acme");
    expect(word.align).toBe("left");
    expect(word.baseline).toBe("top");
    const logo = watermark({ ...kit, logo: { key: "logo.png", width: 200, height: 100 } }, { width: 640, height: 360, size: 40 }) as {
      type: string;
      width?: number;
      height?: number;
    };
    expect(logo.type).toBe("image");
    expect(logo.height).toBe(40);
    expect(logo.width).toBe(80); // aspect 2:1 preserved
    // the produced watermark node is a valid scene node
    const spec = {
      specVersion: SPEC_VERSION,
      width: 640,
      height: 360,
      fps: 1,
      duration: 1,
      seed: 1,
      background: "#fff",
      nodes: [word as unknown as Node],
    };
    expect(validateScene(spec)).toMatchObject({ valid: true });
  });
  it("titleCard is a valid, branded intro scene", () => {
    const tc = titleCard(kit, { title: "Quarterly Review", subtitle: "FY2026" });
    expect(validateScene(tc)).toMatchObject({ valid: true });
    expect(tc.background).toBe(brandTheme(kit).palette.bg);
    expect(tc.nodes.some((n) => n.type === "text" && (n as { text?: string }).text === "Quarterly Review")).toBe(true);
    expect(Buffer.from(renderFrame(tc, 0).pixels).equals(Buffer.from(renderFrame(tc, 0).pixels))).toBe(true);
  });
  it("lowerThird builds a readable branded bar", () => {
    const lt = lowerThird(kit, { title: "Jane Doe", subtitle: "Chief Analyst", y: 360 });
    const kids = lt.children;
    expect(kids.some((n) => n.id.endsWith("-edge"))).toBe(true);
    const title = kids.find((n) => n.id.endsWith("-title")) as { fill?: string };
    const card = kids.find((n) => n.id.endsWith("-card")) as { fill?: string };
    expect(contrastRatio(title.fill!, card.fill!)).toBeGreaterThan(4.5); // readable on the primary card
    const spec = {
      specVersion: SPEC_VERSION,
      width: 600,
      height: 440,
      fps: 1,
      duration: 1,
      seed: 1,
      background: "#fff",
      nodes: [lt as Node],
    };
    expect(validateScene(spec)).toMatchObject({ valid: true });
  });
});
