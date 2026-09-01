/**
 * Expand catalog builders referenced by an authored spec.
 *
 * A model asked to draw a schematic places primitives by eye, and the result is
 * not a circuit: wires stop short of the components they should meet, and the
 * loop never closes. The catalog builders already own that geometry — they emit
 * connected wiring and real component symbols — but nothing let an authored
 * spec reach them.
 *
 * So a spec may carry a `builders` array beside `nodes`. Each entry names a
 * catalog builder and its params; this expands them into nodes and removes the
 * field, leaving a spec the validator and renderer already understand. Nothing
 * downstream needs to know builders exist.
 */
import { BuilderRegistry, CatalogError } from "../catalog/index.js";

export interface BuilderPlacement {
  id?: string;
  builder: string;
  params?: unknown;
  x?: number;
  y?: number;
  /** Uniform scale for the whole assembly, when it has to fit a smaller space than its natural size. */
  scale?: number;
}

export interface ExpansionResult {
  spec: unknown;
  /** Builder names successfully expanded, in order. */
  expanded: string[];
  /** Human-readable problems; the caller decides whether they are fatal. */
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function expandBuilderPlacements(spec: unknown, registry: BuilderRegistry): ExpansionResult {
  if (!isObject(spec) || !Array.isArray(spec["builders"])) {
    return { spec, expanded: [], errors: [] };
  }
  const placements = spec["builders"] as BuilderPlacement[];
  const nodes = Array.isArray(spec["nodes"]) ? [...(spec["nodes"] as unknown[])] : [];
  const expanded: string[] = [];
  const errors: string[] = [];

  placements.forEach((placement, index) => {
    const name = isObject(placement) ? String(placement.builder ?? "") : "";
    if (!registry.get(name)) {
      errors.push(`builders[${index}]: unknown builder ${JSON.stringify(name)}`);
      return;
    }
    try {
      const built = registry.invokeNode(name, placement.params ?? {});
      // Wrap in a group so the placement's own x/y positions the whole assembly;
      // the builder lays out its interior in local coordinates.
      nodes.push({
        id: placement.id ?? `builder-${index}`,
        type: "group",
        x: placement.x ?? 0,
        y: placement.y ?? 0,
        ...(typeof placement.scale === "number" && placement.scale !== 1 ? { scale: placement.scale } : {}),
        children: [built.node],
      });
      expanded.push(name);
    } catch (err) {
      const issues = err instanceof CatalogError && Array.isArray(err.issues) ? err.issues : [];
      const detail =
        err instanceof CatalogError
          ? issues.map((issue) => String((issue as { message?: unknown })?.message ?? issue)).join("; ") || err.code
          : String(err);
      errors.push(`builders[${index}] (${name}): ${detail}`);
    }
  });

  const next: Record<string, unknown> = { ...spec, nodes };
  delete next["builders"];
  return { spec: next, expanded, errors };
}
