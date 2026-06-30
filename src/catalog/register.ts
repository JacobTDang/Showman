/**
 * Explicit registration of every catalog tool. Registration order is greppable and
 * deterministic; tests register fresh registries, production uses the memoized default.
 */

import { BuilderRegistry } from "./registry.js";
import { numberLineTool } from "./math/numberLine.tool.js";
import { reactionTool } from "./chem/reaction.tool.js";
import { mathLessonTools } from "./math/lessons.tool.js";

/** Build a fresh registry with all known tools registered. */
export function createDefaultRegistry(): BuilderRegistry {
  const registry = new BuilderRegistry();
  registry.register(numberLineTool);
  registry.register(reactionTool);
  for (const tool of mathLessonTools) registry.register(tool);
  return registry;
}

let cached: BuilderRegistry | undefined;

/** The process-wide default registry (built once). */
export function defaultRegistry(): BuilderRegistry {
  if (!cached) cached = createDefaultRegistry();
  return cached;
}
