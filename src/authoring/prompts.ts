/**
 * Externalized authoring prompts.
 *
 * The LLM authors' system prompt, few-shot examples, and validation-correction text
 * live in editable template files under `prompts/` — NOT hard-coded in source — so they
 * can be tuned, versioned, A/B-tested, and overridden per deployment without a rebuild.
 *
 * Resolution precedence for the prompt directory:
 *   1. an explicit `dir` passed to {@link loadPrompts}
 *   2. the `SHOWMAN_PROMPT_DIR` environment variable
 *   3. the bundled default directory next to the build (`<root>/prompts`)
 *
 * Each template may use `{{placeholders}}`: the system template fills `{{schema}}` and
 * `{{examples}}`; the correction template fills `{{errors}}`. If a file is missing from a
 * custom dir we fall back to the bundled default, and finally to a built-in string, so
 * authoring never crashes for lack of a prompt file.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

/** Absolute path to the repo's bundled `prompts/` directory, resolved from this module. */
export function defaultPromptDir(): string {
  // <root>/src/authoring/prompts.ts (tsx/vitest) or <root>/dist/authoring/prompts.js (built);
  // both sit two levels under the repo root, where `prompts/` is bundled (like `assets/`).
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "prompts");
}

/** Built-in fallbacks so authoring works even if the prompt files are absent. */
const BUILTIN: Record<string, string> = {
  "author-system.md":
    "You are an expert author of beautiful, warm, pedagogically-structured animated lessons for young children. " +
    "Given a brief, output ONLY a single JSON Scene Spec object — no prose, no markdown fences, no comments. " +
    "Use ONLY the node types, properties, easings, and fonts described in this schema, and respect its limits.\n\nSCHEMA:\n{{schema}}\n{{examples}}",
  "author-correction.md":
    "Your previous attempt failed validation. Fix EXACTLY these errors and output the corrected, complete Scene Spec as a single JSON object:\n{{errors}}",
  "author-examples.md": "",
};

export interface PromptSourceOptions {
  /** Override the prompt directory (highest precedence). */
  dir?: string;
  /** Override the resolved environment for testing. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

export interface AuthorPrompts {
  /** The full system prompt with the schema text (and any few-shot examples) interpolated. */
  system(schemaText: string): string;
  /** The correction suffix for the user message; empty string when there are no errors. */
  correction(errors: unknown[]): string;
  /** Where each template was actually loaded from (for diagnostics). */
  readonly sources: { system: string; correction: string; examples: string };
}

/** Read `name` from `dir`, falling back to the default dir, then the built-in string. */
function readTemplate(name: string, dir: string): { text: string; source: string } {
  const primary = resolve(dir, name);
  if (existsSync(primary)) return { text: readFileSync(primary, "utf8"), source: primary };
  const fallback = resolve(defaultPromptDir(), name);
  if (dir !== defaultPromptDir() && existsSync(fallback)) return { text: readFileSync(fallback, "utf8"), source: fallback };
  return { text: BUILTIN[name] ?? "", source: `builtin:${name}` };
}

/**
 * Load the authoring prompt pack. Templates are read once per call (cheap), so callers
 * typically build this once at author construction and reuse it.
 */
export function loadPrompts(opts: PromptSourceOptions = {}): AuthorPrompts {
  const env = opts.env ?? process.env;
  const dir = opts.dir ?? env.SHOWMAN_PROMPT_DIR ?? defaultPromptDir();

  const sys = readTemplate("author-system.md", dir);
  const corr = readTemplate("author-correction.md", dir);
  const ex = readTemplate("author-examples.md", dir);
  const examples = ex.text.trim();

  return {
    system(schemaText: string): string {
      return sys.text.replace("{{schema}}", schemaText).replace("{{examples}}", examples ? `\n${examples}\n` : "");
    },
    correction(errors: unknown[]): string {
      if (!errors || errors.length === 0) return "";
      return `\n\n${corr.text.replace("{{errors}}", JSON.stringify(errors, null, 2))}`;
    },
    sources: { system: sys.source, correction: corr.source, examples: ex.source },
  };
}
