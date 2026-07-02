/** Builder tool-catalog: a typed registry the orchestrator's selector chooses from. */

export type { BuilderTool, BuilderOutput, BBox, CatalogDomain, BuilderLevel } from "./types.js";
export { BuilderRegistry, CatalogError } from "./registry.js";
export type { CatalogErrorCode } from "./registry.js";
export { describeCatalogCompact } from "./describe.js";
export { createDefaultRegistry, defaultRegistry } from "./register.js";
export { assembleScene } from "./assemble.js";
export type { AssembleRequest, AssembleResult, AssemblePlacement, AssembleBeat } from "./assemble.js";
export { planPlacementMotion, titleReveal, tracksEnd, ANIMATE_HINTS } from "./motion.js";
export type { AnimateHint, PlacementMotion } from "./motion.js";
