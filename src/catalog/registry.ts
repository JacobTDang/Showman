/**
 * The builder registry: register typed tools, validate + invoke them, and emit
 * deterministic JSON-Schema for the LLM. Heterogeneous tool param types are erased on
 * storage (validated at the boundary by each tool's own Zod schema).
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import type { BuilderOutput, BuilderTool, CatalogDomain } from "./types.js";
import type { SceneSpec } from "../spec/types.js";

export type CatalogErrorCode = "UNKNOWN_BUILDER" | "DUPLICATE_BUILDER" | "INVALID_PARAMS" | "NOT_NODE_BUILDER" | "NOT_SCENE_BUILDER";

/** A structured catalog failure (never a raw throw across the HTTP boundary). */
export class CatalogError extends Error {
  constructor(
    readonly code: CatalogErrorCode,
    readonly builder: string,
    readonly issues?: unknown,
  ) {
    super(`${code}: ${builder}`);
    this.name = "CatalogError";
  }
}

export class BuilderRegistry {
  private readonly tools = new Map<string, BuilderTool>();

  /** Register a tool. Throws on a duplicate name (registration is explicit + deterministic). */
  register<P>(tool: BuilderTool<P>): this {
    if (this.tools.has(tool.name)) throw new CatalogError("DUPLICATE_BUILDER", tool.name);
    this.tools.set(tool.name, tool as unknown as BuilderTool);
    return this;
  }

  get(name: string): BuilderTool | undefined {
    return this.tools.get(name);
  }

  /** Tools (optionally domain-filtered), sorted by name for stable output. */
  list(domain?: CatalogDomain): BuilderTool[] {
    return [...this.tools.values()].filter((t) => (domain ? t.domain === domain : true)).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Validate params and invoke a node-level builder. */
  invokeNode(name: string, raw: unknown): BuilderOutput {
    const tool = this.require(name);
    if (tool.level !== "node" || !tool.build) throw new CatalogError("NOT_NODE_BUILDER", name);
    return tool.build(this.parse(tool, raw));
  }

  /** Validate params and invoke a scene-level builder. */
  invokeScene(name: string, raw: unknown): SceneSpec {
    const tool = this.require(name);
    if (tool.level !== "scene" || !tool.buildScene) throw new CatalogError("NOT_SCENE_BUILDER", name);
    return tool.buildScene(this.parse(tool, raw));
  }

  /** Deterministic JSON-Schema for a tool's params (sorted keys → stable hashing). */
  jsonSchema(name: string): unknown {
    return sortKeysDeep(zodToJsonSchema(this.require(name).params, { target: "jsonSchema7", $refStrategy: "none" }));
  }

  private require(name: string): BuilderTool {
    const tool = this.tools.get(name);
    if (!tool) throw new CatalogError("UNKNOWN_BUILDER", name);
    return tool;
  }

  private parse(tool: BuilderTool, raw: unknown): unknown {
    const result = tool.params.safeParse(raw);
    if (!result.success) throw new CatalogError("INVALID_PARAMS", tool.name, result.error.issues);
    return result.data;
  }
}

/** Recursively sort object keys so emitted JSON-Schema is byte-stable across runs. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortKeysDeep(src[key]);
    return out;
  }
  return value;
}
