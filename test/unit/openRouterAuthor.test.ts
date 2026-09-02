import { describe, it, expect } from "vitest";
import { OpenRouterSpecAuthor, validateScene, describeScene } from "../../src/index.js";
import type { AuthorContext } from "../../src/index.js";

/** A fake fetch that records the request and returns a canned chat completion. */
function fakeFetch(content: string, opts: { ok?: boolean; status?: number; error?: string } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => (opts.error ? { error: { message: opts.error } } : { choices: [{ message: { content } }] }),
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ctx: AuthorContext = { schema: describeScene(), attempt: 1, audience: "electrical engineering graduate students" };

const validSpecJson = JSON.stringify({
  specVersion: 1,
  width: 320,
  height: 180,
  fps: 10,
  duration: 1,
  background: "#fdf6e3",
  nodes: [{ id: "dot", type: "ellipse", x: 20, y: 20, width: 40, height: 40, fill: "#e63946" }],
});

describe("OpenRouterSpecAuthor", () => {
  it("requires an API key", () => {
    expect(() => new OpenRouterSpecAuthor({ apiKey: "" })).toThrow(/API key/);
  });

  it("parses a spec out of a fenced completion and sends the schema + brief", async () => {
    const { impl, calls } = fakeFetch("Sure!\n```json\n" + validSpecJson + "\n```");
    const author = new OpenRouterSpecAuthor({ apiKey: "test-key", model: "openai/gpt-oss-120b", fetchImpl: impl });

    const spec = await author.propose("count to 3 with dots", ctx);
    expect(validateScene(spec).valid).toBe(true);

    expect(calls.length).toBe(1);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(JSON.stringify(body.messages)).toContain("count to 3 with dots");
    expect(JSON.stringify(body.messages)).toContain("electrical engineering graduate students");
    expect(JSON.stringify(body.messages)).toContain("specVersion"); // schema embedded
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-key");
  });

  it("includes validation feedback on a self-correction attempt", async () => {
    const { impl, calls } = fakeFetch(validSpecJson);
    const author = new OpenRouterSpecAuthor({ apiKey: "k", fetchImpl: impl });
    await author.propose("count to 3", {
      schema: describeScene(),
      attempt: 2,
      previousCandidate: { specVersion: 1, nodes: [] },
      feedback: { errors: [{ path: "nodes", code: "MISSING_FIELD", message: "nodes required" }] },
    });
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(JSON.stringify(body.messages)).toContain("MISSING_FIELD");
    expect(body.messages).toContainEqual({ role: "assistant", content: JSON.stringify({ specVersion: 1, nodes: [] }) });
    expect(body.messages.at(-1).role).toBe("user");
  });

  it("throws on a non-OK response", async () => {
    const { impl } = fakeFetch("", { ok: false, status: 429, error: "rate limited" });
    const author = new OpenRouterSpecAuthor({ apiKey: "k", fetchImpl: impl });
    await expect(author.propose("x", ctx)).rejects.toThrow(/OpenRouter request failed/);
  });

  it("throws on an empty completion", async () => {
    const { impl } = fakeFetch("   ");
    const author = new OpenRouterSpecAuthor({ apiKey: "k", fetchImpl: impl });
    await expect(author.propose("x", ctx)).rejects.toThrow(/empty completion/);
  });

  it("reports a timeout that occurs while reading the response body", async () => {
    const timeout = Object.assign(new Error("body aborted"), { name: "TimeoutError" });
    const impl = (async () =>
      ({ ok: true, status: 200, json: async () => Promise.reject(timeout) }) as unknown as Response) as typeof fetch;
    const author = new OpenRouterSpecAuthor({ apiKey: "k", timeoutMs: 1234, fetchImpl: impl });

    await expect(author.propose("x", ctx)).rejects.toThrow(/timed out after 1234ms while reading/);
  });

  it("still reports genuine response parse failures as non-JSON", async () => {
    const impl = (async () =>
      ({ ok: true, status: 200, json: async () => Promise.reject(new SyntaxError("bad JSON")) }) as unknown as Response) as typeof fetch;
    const author = new OpenRouterSpecAuthor({ apiKey: "k", fetchImpl: impl });

    await expect(author.propose("x", ctx)).rejects.toThrow(/non-JSON response \(status 200\)/);
  });
});

describe("OPENROUTER_MAX_TOKENS", () => {
  const withEnv = async <T>(value: string | undefined, fn: () => Promise<T> | T): Promise<T> => {
    const had = Object.prototype.hasOwnProperty.call(process.env, "OPENROUTER_MAX_TOKENS");
    const prev = process.env.OPENROUTER_MAX_TOKENS;
    if (value === undefined) delete process.env.OPENROUTER_MAX_TOKENS;
    else process.env.OPENROUTER_MAX_TOKENS = value;
    try {
      return await fn();
    } finally {
      if (had) process.env.OPENROUTER_MAX_TOKENS = prev;
      else delete process.env.OPENROUTER_MAX_TOKENS;
    }
  };

  const sentMaxTokens = async (calls: Array<{ init: RequestInit }>): Promise<number> => JSON.parse(String(calls[0]!.init.body)).max_tokens;

  // A reasoning model spends part of its budget thinking before the JSON starts, so the
  // 6000 default truncates specs that a larger budget completes. Every other OpenRouter
  // setting is env-readable; this one was not, leaving no way to raise it in deployment.
  it("raises the output budget from the environment", async () => {
    const { impl, calls } = fakeFetch(validSpecJson);
    await withEnv("16000", async () => {
      await new OpenRouterSpecAuthor({ apiKey: "k", fetchImpl: impl }).propose("brief", ctx);
    });
    expect(await sentMaxTokens(calls)).toBe(16000);
  });

  it("keeps the 6000 default when unset", async () => {
    const { impl, calls } = fakeFetch(validSpecJson);
    await withEnv(undefined, async () => {
      await new OpenRouterSpecAuthor({ apiKey: "k", fetchImpl: impl }).propose("brief", ctx);
    });
    expect(await sentMaxTokens(calls)).toBe(6000);
  });

  it("lets an explicit option win over the environment", async () => {
    const { impl, calls } = fakeFetch(validSpecJson);
    await withEnv("16000", async () => {
      await new OpenRouterSpecAuthor({ apiKey: "k", fetchImpl: impl, maxTokens: 2048 }).propose("brief", ctx);
    });
    expect(await sentMaxTokens(calls)).toBe(2048);
  });

  it("rejects a non-positive or unparseable value instead of silently ignoring it", async () => {
    for (const bad of ["0", "-1", "lots"]) {
      await withEnv(bad, () => {
        expect(() => new OpenRouterSpecAuthor({ apiKey: "k" }), `value ${bad}`).toThrow(/OPENROUTER_MAX_TOKENS/);
      });
    }
  });
});
