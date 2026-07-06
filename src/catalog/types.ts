/**
 * Builder tool-catalog types.
 *
 * The catalog turns Showman's hand-written builders into a typed, self-describing,
 * self-validating registry the orchestrator's Domain Selector chooses from — replacing
 * the old regex dispatch. One Zod schema per builder is the single source of truth for
 * runtime validation AND the JSON-Schema handed to the LLM.
 *
 * Two levels:
 *   - "node"  — returns a placeable node (+ bbox for layout). Composed into a scene.
 *   - "scene" — returns a whole narrated SceneSpec (e.g. buildMathLesson topics).
 */

import type { ZodType, ZodTypeDef } from "zod";
import type { Node, SceneSpec } from "../spec/types.js";

export type CatalogDomain = "math" | "chem" | "physics" | "diagram" | "chart" | "items";
export type BuilderLevel = "scene" | "node";

/** Local extents of a built node, used by the deterministic layout step. */
export interface BBox {
  w: number;
  h: number;
}

/** A node-level builder's output. */
export interface BuilderOutput {
  node: Node;
  bbox?: BBox;
}

/**
 * One self-describing builder tool. `params` (Zod) drives validation + JSON-Schema.
 * A tool implements exactly one of `build` (node-level) or `buildScene` (scene-level),
 * matching its `level`.
 */
export interface BuilderTool<P = unknown> {
  /** Catalog name, e.g. "math.numberLine" or "chem.reaction". */
  name: string;
  domain: CatalogDomain;
  level: BuilderLevel;
  /** One terse line: what this tool DEPICTS. Feeds the selector's compact digest. */
  description: string;
  /** Phrases the offline keyword selector matches against (replaces regex intents). */
  keywords: string[];
  /**
   * The single source of truth for params: runtime validation + emitted JSON-Schema.
   * Input is `unknown` (not `P`) so schemas using `.default()`/`.optional()` — whose input
   * type differs from their parsed output `P` — still satisfy the contract.
   */
  params: ZodType<P, ZodTypeDef, unknown>;
  /** Node-level builder: validated params -> a placeable node. */
  build?(params: P): BuilderOutput;
  /** Scene-level builder: validated params -> a whole narrated SceneSpec. */
  buildScene?(params: P): SceneSpec;
  /** A valid example params object (round-tripped through the registry in CI). */
  example: P;
}
