/**
 * M4.3 — Authoring loop.
 *
 * brief → plan → emit spec → validate → (preview) → self-correct → submit. The
 * agent self-corrects against *structured validation* (and optionally what a
 * preview frame shows) before committing to a full render. The actual
 * spec-proposing step is a pluggable `SpecAuthor` — an LLM in production, a scripted
 * or template author in tests — so the loop is verifiable without a model.
 */

import type { SceneSpec } from "../spec/types.js";
import { describeSceneCompact, type SchemaDescription } from "../spec/describe.js";
import type { ValidationError } from "../validator/validate.js";
import type { ShowmanClient } from "../mcp/showmanTools.js";
import type { RenderOptions } from "../service/renderService.js";
import { loadPrompts, type AuthorPrompts } from "./prompts.js";
import { autoRepairSpec } from "./autoRepair.js";
import { extractJson } from "./jsonRepair.js";

// Re-exported for back-compat: callers and tests import `extractJson` from here.
export { extractJson } from "./jsonRepair.js";

/** How much schema to put in the prompt: a compact digest (default, token-frugal) or the full JSON. */
export type SchemaMode = "compact" | "full";

/** Resolve the schema text for a prompt given the mode and the full schema in context. */
function schemaText(mode: SchemaMode, schema: SchemaDescription): string {
  return mode === "full" ? JSON.stringify(schema) : describeSceneCompact();
}

/** Read the default schema mode from the environment (compact unless told otherwise). */
function defaultSchemaMode(): SchemaMode {
  return process.env.SHOWMAN_SCHEMA_MODE === "full" ? "full" : "compact";
}

export interface AuthorContext {
  schema: SchemaDescription;
  attempt: number;
  feedback?: { errors?: ValidationError[]; note?: string };
}

export interface SpecAuthor {
  /** Propose a Scene Spec for `brief`, optionally correcting from prior feedback. */
  propose(brief: string, context: AuthorContext): Promise<unknown>;
}

export interface AuthoringAttempt {
  attempt: number;
  valid: boolean;
  errorCount: number;
  previewed?: boolean;
  /** Mechanical fixes auto-applied this attempt (clamps, key renames) — no LLM round-trip spent. */
  repaired?: string[];
}

export interface AuthoringResult {
  ok: boolean;
  spec?: SceneSpec;
  jobId?: string;
  attempts: number;
  history: AuthoringAttempt[];
  error?: string;
}

export interface AuthoringOptions {
  maxAttempts?: number;
  /** Render a preview frame after validation passes (catches "valid but blank"). */
  preview?: boolean;
  renderOptions?: RenderOptions;
}

export class AuthoringAgent {
  constructor(
    private readonly client: ShowmanClient,
    private readonly author: SpecAuthor,
    private readonly options: AuthoringOptions = {},
  ) {}

  /**
   * Author a valid, preview-passing spec for `brief` WITHOUT submitting it to render.
   * The self-correction loop (propose → validate → preview) is identical to `run`; this
   * just stops at a good spec so callers can render synchronously (the atomic API path).
   */
  async authorSpec(
    brief: string,
  ): Promise<{ ok: boolean; spec?: SceneSpec; attempts: number; history: AuthoringAttempt[]; error?: string }> {
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3);
    const schema = await this.client.getSchema();
    const history: AuthoringAttempt[] = [];
    let feedback: AuthorContext["feedback"];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let spec = await this.author.propose(brief, { schema, attempt, ...(feedback ? { feedback } : {}) });

      let validation = await this.client.validate(spec);
      let repaired: string[] | undefined;
      if (!validation.valid) {
        // Try a cheap, deterministic repair (clamp ranges, fix typo'd keys/easings) before
        // spending another whole LLM round-trip on errors a machine can fix itself.
        const fix = autoRepairSpec(spec, validation.errors);
        if (fix.fixed.length > 0) {
          const reval = await this.client.validate(fix.spec);
          if (reval.valid) {
            spec = fix.spec;
            validation = reval;
            repaired = fix.fixed;
          } else {
            history.push({ attempt, valid: false, errorCount: reval.errors.length, repaired: fix.fixed });
            feedback = { errors: reval.errors, note: "The spec failed validation. Fix the listed errors." };
            continue;
          }
        } else {
          history.push({ attempt, valid: false, errorCount: validation.errors.length });
          feedback = { errors: validation.errors, note: "The spec failed validation. Fix the listed errors." };
          continue;
        }
      }

      let previewed = false;
      if (this.options.preview) {
        const pv = await this.client.preview(spec, 0);
        if (!pv.ok) {
          history.push({ attempt, valid: true, errorCount: pv.errors.length, previewed: false, ...(repaired ? { repaired } : {}) });
          feedback = { errors: pv.errors as ValidationError[], note: "Preview failed." };
          continue;
        }
        previewed = true;
      }

      history.push({ attempt, valid: true, errorCount: 0, previewed, ...(repaired ? { repaired } : {}) });
      return { ok: true, spec: spec as SceneSpec, attempts: attempt, history };
    }
    return { ok: false, attempts: maxAttempts, history, error: "exhausted attempts without a valid spec" };
  }

  /** Run the loop for `brief`, then submit for async render. Returns the submitted jobId on success. */
  async run(brief: string): Promise<AuthoringResult> {
    const authored = await this.authorSpec(brief);
    if (!authored.ok || !authored.spec) {
      return { ok: false, attempts: authored.attempts, history: authored.history, error: authored.error ?? "authoring failed" };
    }
    const history = authored.history;
    const previewed = history[history.length - 1]?.previewed ?? false;
    const submitted = await this.client.submit(authored.spec, this.options.renderOptions ?? {});
    if (!submitted.ok) {
      history.push({ attempt: authored.attempts, valid: true, errorCount: submitted.errors.length, previewed });
      return { ok: false, attempts: authored.attempts, history, error: "submit rejected the spec" };
    }
    return { ok: true, spec: authored.spec, jobId: submitted.jobId, attempts: authored.attempts, history };
  }
}

/** Deterministic author that returns scripted specs in sequence — for testing the loop. */
export class ScriptedAuthor implements SpecAuthor {
  private i = 0;
  constructor(private readonly specs: unknown[]) {}
  async propose(): Promise<unknown> {
    const spec = this.specs[Math.min(this.i, this.specs.length - 1)];
    this.i++;
    return spec;
  }
}

export interface AnthropicAuthorOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  /** Prompt pack (externalized templates). Defaults to the bundled/`SHOWMAN_PROMPT_DIR` pack. */
  prompts?: AuthorPrompts;
  /** Schema verbosity in the prompt: "compact" digest (default) or "full" JSON. */
  schemaMode?: SchemaMode;
}

/**
 * Real LLM author: asks Claude for a Scene Spec given the schema + brief, and feeds
 * validation errors back for self-correction. Requires ANTHROPIC_API_KEY; not
 * exercised by tests (the loop itself is tested with ScriptedAuthor).
 */
export class AnthropicSpecAuthor implements SpecAuthor {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly fetchImpl: typeof fetch;
  private readonly prompts: AuthorPrompts;
  private readonly schemaMode: SchemaMode;

  constructor(opts: AnthropicAuthorOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.model = opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
    this.maxTokens = opts.maxTokens ?? 4096;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.prompts = opts.prompts ?? loadPrompts();
    this.schemaMode = opts.schemaMode ?? defaultSchemaMode();
    if (!this.apiKey) throw new Error("AnthropicSpecAuthor requires an API key (ANTHROPIC_API_KEY).");
  }

  async propose(brief: string, ctx: AuthorContext): Promise<unknown> {
    const system = this.prompts.system(schemaText(this.schemaMode, ctx.schema));
    const correction = this.prompts.correction(ctx.feedback?.errors ?? []);
    const res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        messages: [{ role: "user", content: `Brief: ${brief}${correction}` }],
      }),
    });
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    return extractJson(text);
  }
}
