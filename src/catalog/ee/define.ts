import type { BuilderTool } from "../types.js";

/**
 * Every EE 230 lesson is a scene-level physics tool. Each tier registers its own array in
 * its own file, so the tiers can be built in parallel without touching one another;
 * `lessons.tool.ts` concatenates them.
 */
export function lesson<P>(tool: Omit<BuilderTool<P>, "domain" | "level">): BuilderTool {
  return { domain: "physics", level: "scene", ...tool } as BuilderTool;
}
