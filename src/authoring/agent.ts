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
import type { SchemaDescription } from "../spec/describe.js";
import type { ValidationError } from "../validator/validate.js";
import type { ShowmanClient } from "../mcp/showmanTools.js";
import type { RenderOptions } from "../service/renderService.js";

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

  /** Run the loop for `brief`. Returns the submitted jobId on success. */
  async run(brief: string): Promise<AuthoringResult> {
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3);
    const schema = await this.client.getSchema();
    const history: AuthoringAttempt[] = [];
    let feedback: AuthorContext["feedback"];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const spec = await this.author.propose(brief, { schema, attempt, ...(feedback ? { feedback } : {}) });

      const validation = await this.client.validate(spec);
      if (!validation.valid) {
        history.push({ attempt, valid: false, errorCount: validation.errors.length });
        feedback = { errors: validation.errors, note: "The spec failed validation. Fix the listed errors." };
        continue;
      }

      let previewed = false;
      if (this.options.preview) {
        const pv = await this.client.preview(spec, 0);
        if (!pv.ok) {
          history.push({ attempt, valid: true, errorCount: pv.errors.length, previewed: false });
          feedback = { errors: pv.errors as ValidationError[], note: "Preview failed." };
          continue;
        }
        previewed = true;
      }

      const submitted = await this.client.submit(spec, this.options.renderOptions ?? {});
      if (!submitted.ok) {
        history.push({ attempt, valid: true, errorCount: submitted.errors.length, previewed });
        feedback = { errors: submitted.errors as ValidationError[], note: "Submit rejected the spec." };
        continue;
      }

      history.push({ attempt, valid: true, errorCount: 0, previewed });
      return { ok: true, spec: spec as SceneSpec, jobId: submitted.jobId, attempts: attempt, history };
    }

    return { ok: false, attempts: maxAttempts, history, error: "exhausted attempts without a valid, submittable spec" };
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

  constructor(opts: AnthropicAuthorOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.model = opts.model ?? "claude-opus-4-8";
    this.maxTokens = opts.maxTokens ?? 4096;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (!this.apiKey) throw new Error("AnthropicSpecAuthor requires an API key (ANTHROPIC_API_KEY).");
  }

  async propose(brief: string, ctx: AuthorContext): Promise<unknown> {
    const system =
      "You are an expert author of beautiful, pedagogically-structured animated lessons for young children. " +
      "Given a brief, output ONLY a single JSON Scene Spec object (no markdown, no prose) conforming to this schema:\n" +
      JSON.stringify(ctx.schema);
    const correction = ctx.feedback?.errors?.length
      ? `\n\nYour previous attempt had these validation errors — fix them precisely:\n${JSON.stringify(ctx.feedback.errors, null, 2)}`
      : "";
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

/** Extract the first balanced JSON object from a string (tolerates stray prose). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON object in author response");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("unbalanced JSON in author response");
}
