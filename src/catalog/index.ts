/** Builder tool-catalog: a typed registry the orchestrator's selector chooses from. */

export type { BuilderTool, BuilderOutput, BBox, CatalogDomain, BuilderLevel } from "./types.js";
export { BuilderRegistry, CatalogError } from "./registry.js";
export type { CatalogErrorCode } from "./registry.js";
export { describeCatalogCompact } from "./describe.js";
export { createDefaultRegistry, defaultRegistry } from "./register.js";
