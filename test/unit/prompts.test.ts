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
