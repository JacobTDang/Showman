import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  BuilderRegistry,
  CatalogError,
  createDefaultRegistry,
  describeCatalogCompact,
  validateScene,
  type BuilderTool,
} from "../../src/index.js";

const registry = createDefaultRegistry();

describe("builder registry", () => {
  it("rejects duplicate registration", () => {
    const r = new BuilderRegistry();
    const tool: BuilderTool<{ a: number }> = {
      name: "x.dup",
      domain: "math",
      level: "node",
      description: "d",
      keywords: [],
      params: z.object({ a: z.number() }),
      example: { a: 1 },
      build: () => ({ node: { id: "n", type: "rect", x: 0, y: 0, width: 1, height: 1 } }),
    };
    r.register(tool);
    expect(() => r.register(tool)).toThrow(CatalogError);
  });

  it("lists tools sorted by name and filtered by domain", () => {
    const names = registry.list("math").map((t) => t.name);
    expect(names).toContain("math.numberLine");
    expect(names).toContain("math.graphingLesson");
    expect(names).toEqual([...names].sort());
    expect(registry.list("chem").every((t) => t.domain === "chem")).toBe(true);
  });

  it("invokes a node-level builder with validated params", () => {
    const out = registry.invokeNode("math.numberLine", { from: 0, to: 10 });
    expect(out.node.type).toBe("group");
    expect(out.bbox?.w).toBeGreaterThan(0);
  });

  it("invokes a scene-level builder into a valid SceneSpec", () => {
    const spec = registry.invokeScene("math.graphingLesson", { m: 2, b: 1 });
    expect(validateScene(spec).valid).toBe(true);
  });

  it("rejects invalid params with a structured CatalogError", () => {
    try {
      registry.invokeNode("math.numberLine", { from: 5, to: 5 }); // refine: must differ
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CatalogError);
      expect((e as CatalogError).code).toBe("INVALID_PARAMS");
    }
  });

  it("errors on unknown builder and on level mismatch", () => {
    expect(() => registry.invokeNode("nope", {})).toThrow(/UNKNOWN_BUILDER/);
    expect(() => registry.invokeNode("math.graphingLesson", {})).toThrow(/NOT_NODE_BUILDER/);
    expect(() => registry.invokeScene("math.numberLine", { from: 0, to: 1 })).toThrow(/NOT_SCENE_BUILDER/);
  });

  it("emits deterministic JSON-Schema (stable + sorted keys)", () => {
    const a = JSON.stringify(registry.jsonSchema("math.numberLine"));
    const b = JSON.stringify(registry.jsonSchema("math.numberLine"));
    expect(a).toBe(b);
    const schema = registry.jsonSchema("math.numberLine") as { properties?: Record<string, unknown> };
    expect(Object.keys(schema.properties ?? {})).toContain("from");
  });
});

describe("compact catalog digest", () => {
  it("names tools and their params, token-frugally", () => {
    const digest = describeCatalogCompact(registry);
    expect(digest).toContain("math.numberLine");
    expect(digest).toContain("chem.reaction");
    const mathOnly = describeCatalogCompact(registry, "math");
    expect(mathOnly).not.toContain("chem.reaction");
  });
});

describe("every registered tool round-trips its own example", () => {
  for (const tool of registry.list()) {
    it(`${tool.name} (${tool.level})`, () => {
      if (tool.level === "scene") {
        const spec = registry.invokeScene(tool.name, tool.example);
        expect(validateScene(spec).valid).toBe(true);
      } else {
        const out = registry.invokeNode(tool.name, tool.example);
        expect(out.node).toBeDefined();
        expect(typeof out.node.type).toBe("string");
      }
    });
  }
});
