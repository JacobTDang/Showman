import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Strip comments so mentions of forbidden APIs in docs/warnings don't trip the scanner. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Orchestration / IO directories where reading the wall clock or doing network IO is legitimate
 * (job timestamps, lease deadlines, request timeouts). Everything ELSE in src — the whole render
 * path and every pure builder — must be a pure function of (spec, frame, seed).
 */
const ORCHESTRATION_DIRS = new Set(["distributed", "service", "mcp", "authoring", "audio", "encode", "assets", "telemetry"]);

/** Every src file on the pure-render path: all of src minus the orchestration/IO dirs above. */
function pureRenderFiles(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(SRC, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ORCHESTRATION_DIRS.has(entry.name)) out.push(...tsFiles(join(SRC, entry.name)));
    } else if (entry.name.endsWith(".ts")) {
      out.push(join(SRC, entry.name));
    }
  }
  return out;
}

/**
 * The render core is a pure function of (spec, frame, seed). If any module on the render path —
 * the engine, the validator, OR any builder (math, chart, chem, code, physics, brand, items, …) —
 * reached for ambient entropy (the wall clock or Math.random), that guarantee would silently break
 * and every "identical bytes" claim downstream with it. This test fails the build if such a call is
 * ever introduced anywhere outside the explicit orchestration allowlist.
 */
describe("engine purity", () => {
  const forbidden: { pattern: RegExp; why: string }[] = [
    { pattern: /Math\.random\s*\(/, why: "Math.random breaks determinism; use makeRng(seed)" },
    { pattern: /Date\.now\s*\(/, why: "Date.now is ambient state; the engine must not read the clock" },
    { pattern: /\bnew\s+Date\s*\(\s*\)/, why: "new Date() reads the clock; not allowed in the engine" },
    { pattern: /performance\.now\s*\(/, why: "performance.now is ambient time; not allowed in the engine" },
    { pattern: /process\.hrtime/, why: "process.hrtime is ambient time; not allowed in the engine" },
  ];

  it("no render-path source (engine, validator, or any builder) touches the clock or Math.random", () => {
    const files = pureRenderFiles();
    expect(files.length).toBeGreaterThan(20); // the full render path, not just 3 dirs
    const violations: string[] = [];
    for (const file of files) {
      const text = stripComments(readFileSync(file, "utf8"));
      for (const { pattern, why } of forbidden) {
        if (pattern.test(text)) violations.push(`${file}: ${pattern} — ${why}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
