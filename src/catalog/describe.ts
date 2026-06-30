/**
 * Token-frugal catalog digest — the builder-side analogue of describeSceneCompact.
 * One line per tool (name, level, what it depicts, its top-level params), optionally
 * filtered to a domain so the selector prompt carries ~10–25 tools, not the whole set.
 */

import type { BuilderRegistry } from "./registry.js";
import type { CatalogDomain } from "./types.js";

export function describeCatalogCompact(registry: BuilderRegistry, domain?: CatalogDomain): string {
  const tools = registry.list(domain);
  const header = domain
    ? `Builder catalog (${domain}) — ${tools.length} tools. Pick a builder by name and fill its params:`
    : `Builder catalog — ${tools.length} tools. Pick a builder by name and fill its params:`;
  const lines = tools.map((tool) => {
    const schema = registry.jsonSchema(tool.name) as { properties?: Record<string, unknown> };
    const params = schema.properties ? Object.keys(schema.properties) : [];
    const paramStr = params.length ? ` (params: ${params.join(", ")})` : "";
    return `  ${tool.name} [${tool.level}] — ${tool.description}${paramStr}`;
  });
  return [header, ...lines].join("\n");
}
