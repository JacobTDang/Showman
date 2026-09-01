import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPrompts, defaultPromptDir } from "../../src/authoring/prompts.js";

describe("authoring prompt pack", () => {
  it("loads the bundled default pack and interpolates the schema + few-shot examples", () => {
    const p = loadPrompts();
    const sys = p.system('{"SCHEMA":"HERE"}');
    expect(sys).toContain('{"SCHEMA":"HERE"}'); // {{schema}} filled
    expect(sys).not.toContain("{{schema}}");
    expect(sys).not.toContain("{{examples}}");
    expect(sys.toLowerCase()).toContain("scene spec");
    // The bundled examples file is non-empty, so a worked example is woven in.
    expect(sys).toContain("EXAMPLE");
    expect(p.sources.system).toContain("author-system.md");
  });

  it("interpolates a request audience and keeps young children as the default", () => {
    const prompts = loadPrompts();
    expect(prompts.system("schema", "graduate electrical engineers")).toContain("graduate electrical engineers");
    expect(prompts.system("schema")).toContain("young children");
    expect(prompts.system("schema")).toContain("V_C(t)");
  });

  // The example is the one worked spec the author is told to study, so anything it
  // demonstrates gets copied. It used to draw a label dead-centre on the shape it
  // annotates and never set maxWidth -- both are issue #124's defects.
  it("demonstrates wrapped text and labels clear of their artwork", () => {
    const sys = loadPrompts().system("schema");
    const specs = [...sys.matchAll(/^\{"specVersion".*$/gm)].map((m) => JSON.parse(m[0]));
    expect(specs.length).toBeGreaterThan(0);

    const texts = specs.flatMap((s: any) => s.nodes.filter((n: any) => n.type === "text"));
    expect(texts.length).toBeGreaterThan(0);
    // Every multi-word label shows the wrap control.
    for (const t of texts.filter((n: any) => n.text.split(" ").length > 1)) {
      expect(t.maxWidth, `"${t.text}" should set maxWidth`).toBeGreaterThan(0);
    }

    // No text node sits inside a rect it is not the caption of.
    for (const spec of specs) {
      const rects = spec.nodes.filter((n: any) => n.type === "rect");
      for (const t of spec.nodes.filter((n: any) => n.type === "text")) {
        for (const r of rects) {
          const inside = t.x > r.x && t.x < r.x + r.width && t.y > r.y && t.y < r.y + r.height;
          expect(inside, `"${t.text}" sits on top of rect "${r.id}"`).toBe(false);
        }
      }
    }
  });

  it("correction is empty with no errors and embeds the errors otherwise", () => {
    const p = loadPrompts();
    expect(p.correction([])).toBe("");
    const c = p.correction([{ code: "UNKNOWN_TYPE", path: "nodes[0].type" }]);
    expect(c).toContain("UNKNOWN_TYPE");
    expect(c).toContain("nodes[0].type");
    expect(c).not.toContain("{{errors}}");
  });

  it("honors SHOWMAN_PROMPT_DIR and a per-call dir override", () => {
    const dir = mkdtempSync(join(tmpdir(), "showman-prompts-"));
    try {
      writeFileSync(join(dir, "author-system.md"), "CUSTOM SYSTEM {{schema}}{{examples}}");
      writeFileSync(join(dir, "author-correction.md"), "CUSTOM FIX {{errors}}");
      writeFileSync(join(dir, "author-examples.md"), ""); // empty → no example block

      const viaEnv = loadPrompts({ env: { SHOWMAN_PROMPT_DIR: dir } });
      expect(viaEnv.system("SCHEMA")).toBe("CUSTOM SYSTEM SCHEMA");
      expect(viaEnv.correction([{ code: "X" }])).toContain("CUSTOM FIX");

      const viaArg = loadPrompts({ dir });
      expect(viaArg.system("S")).toBe("CUSTOM SYSTEM S");
      expect(viaArg.sources.system).toBe(join(dir, "author-system.md"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the bundled default when a custom dir is missing a file", () => {
    const dir = mkdtempSync(join(tmpdir(), "showman-prompts-partial-"));
    try {
      // Only override the correction; system + examples should fall back to the bundled defaults.
      writeFileSync(join(dir, "author-correction.md"), "ONLY CORRECTION {{errors}}");
      const p = loadPrompts({ dir });
      expect(p.sources.correction).toBe(join(dir, "author-correction.md"));
      expect(p.sources.system).toBe(join(defaultPromptDir(), "author-system.md")); // fell back
      expect(p.system("S")).toContain("Scene Spec");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
