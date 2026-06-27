/**
 * OpenRouter LLM author — proposes a Scene Spec from a brief via OpenRouter's
 * OpenAI-compatible chat/completions API (default model `openai/gpt-oss-120b`).
 *
 * Implements the same SpecAuthor contract as the offline TemplateAuthor and the
 * AnthropicSpecAuthor, so the authoring loop (validate → preview → self-correct →
 * submit) is identical regardless of who writes the spec. Requires an API key; the
 * loop is unit-tested with an injected fetch (no network), with a separate live test
 * gated behind OPENROUTER_API_KEY.
 */

import { extractJson, type AuthorContext, type SpecAuthor } from "./agent.js";

export interface OpenRouterAuthorOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type MessageContent = string | null | Array<{ type?: string; text?: string }>;
interface ChatResponse {
  choices?: Array<{ message?: { content?: MessageContent; reasoning?: string | null } }>;
  error?: { message?: string };
}

/** Coalesce OpenRouter's content (string | array-of-parts | reasoning) to a string. */
function contentToText(message: { content?: MessageContent; reasoning?: string | null } | undefined): string {
  const c = message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p) => p.text ?? "").join("");
  return message?.reasoning ?? "";
}

export class OpenRouterSpecAuthor implements SpecAuthor {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenRouterAuthorOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = opts.model ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b";
    this.maxTokens = opts.maxTokens ?? 6000;
    this.temperature = opts.temperature ?? 0.4;
    this.baseUrl = (opts.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 90_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (!this.apiKey) throw new Error("OpenRouterSpecAuthor requires an API key (OPENROUTER_API_KEY).");
  }

  async propose(brief: string, ctx: AuthorContext): Promise<unknown> {
    const system =
      "You are an expert author of beautiful, warm, pedagogically-structured animated lessons for young children. " +
      "Given a brief, output ONLY a single JSON Scene Spec object — no prose, no markdown fences, no comments. " +
      "Use ONLY the node types, properties, easings, and fonts described in this schema, and respect its limits:\n" +
      JSON.stringify(ctx.schema);
    const correction = ctx.feedback?.errors?.length
      ? `\n\nYour previous attempt failed validation. Fix EXACTLY these errors and output the corrected full spec:\n${JSON.stringify(ctx.feedback.errors, null, 2)}`
      : "";

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          "x-title": process.env.OPENROUTER_TITLE ?? "Showman",
          ...(process.env.OPENROUTER_REFERRER ? { "http-referer": process.env.OPENROUTER_REFERRER } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          messages: [
            { role: "system", content: system },
            { role: "user", content: `Brief: ${brief}${correction}` },
          ],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if ((err as Error).name === "TimeoutError" || (err as Error).name === "AbortError") {
        throw new Error(`OpenRouter request timed out after ${this.timeoutMs}ms`);
      }
      throw new Error(`OpenRouter request failed: ${(err as Error).message}`);
    }

    let data: ChatResponse;
    try {
      data = (await res.json()) as ChatResponse;
    } catch {
      throw new Error(`OpenRouter returned a non-JSON response (status ${res.status}).`);
    }
    if (!res.ok || data.error) {
      throw new Error(`OpenRouter request failed (${res.status}): ${data.error?.message ?? "unknown error"}`);
    }
    const text = contentToText(data.choices?.[0]?.message);
    if (!text.trim()) throw new Error("OpenRouter returned an empty completion.");
    return extractJson(text);
  }
}
