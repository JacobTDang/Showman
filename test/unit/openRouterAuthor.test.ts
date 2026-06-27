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

const ctx: AuthorContext = { schema: describeScene(), attempt: 1 };

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
      feedback: { errors: [{ path: "nodes", code: "MISSING_FIELD", message: "nodes required" }] },
    });
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(JSON.stringify(body.messages)).toContain("MISSING_FIELD");
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
});
