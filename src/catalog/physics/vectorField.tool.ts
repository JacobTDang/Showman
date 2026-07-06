import { z } from "zod";
import { vectorField, type VectorFieldOptions } from "../../physics/fields.js";
import type { BuilderTool } from "../types.js";

/**
 * physics.vectorField — fields.ts's vectorField() takes a raw `field: (nx,ny) => vector`
 * closure, which can't be expressed in a Zod schema or an LLM's JSON output. This wraps
 * it behind a named-preset layer covering the field shapes E&M/gravity/fluid curricula
 * actually draw: a constant field, a point source/sink (with optional physical falloff),
 * a two-pole dipole, and a rotational vortex.
 */

const Falloff = z.enum(["none", "inverse", "inverse-square"]);
type Falloff = z.infer<typeof Falloff>;

const Preset = z.enum(["uniform", "radial-outward", "radial-inward", "dipole", "vortex"]);
type Preset = z.infer<typeof Preset>;

const Params = z.object({
  preset: Preset,
  /** uniform: direction of the constant vector, degrees from +x. */
  angle: z.number().default(0),
  /** Vector length (before falloff). */
  magnitude: z.number().positive().default(1),
  /** Source/vortex center, normalized [0,1]^2 (ny=0 at the bottom, matching vectorField's own convention). */
  centerX: z.number().min(0).max(1).default(0.5),
  centerY: z.number().min(0).max(1).default(0.5),
  /** radial-outward/inward/dipole/vortex: how magnitude decays with distance from the center. */
  falloff: Falloff.default("none"),
  /** dipole: normalized distance between the two poles. */
  separation: z.number().positive().max(1).default(0.3),
  width: z.number().positive().max(1000).default(420),
  height: z.number().positive().max(1000).default(300),
  cols: z.number().int().positive().max(20).default(8),
  rows: z.number().int().positive().max(20).default(6),
  normalize: z.boolean().default(false),
  colorByMagnitude: z.boolean().default(false),
  color: z.string().optional(),
  theme: z.string().optional(),
});
type VectorFieldParams = z.infer<typeof Params>;

function falloffScale(r: number, falloff: Falloff): number {
  if (falloff === "inverse") return 1 / Math.max(r, 0.05);
  if (falloff === "inverse-square") return 1 / Math.max(r * r, 0.0025);
  return 1;
}

/** radial vector from (cx,cy) toward/away from (nx,ny), sign +1 outward / -1 inward. */
function radialVector(nx: number, ny: number, cx: number, cy: number, magnitude: number, falloff: Falloff, sign: 1 | -1) {
  const dx = nx - cx;
  const dy = ny - cy;
  const r = Math.hypot(dx, dy);
  if (r < 1e-6) return { vx: 0, vy: 0 };
  const scale = magnitude * sign * falloffScale(r, falloff);
  return { vx: (dx / r) * scale, vy: (dy / r) * scale };
}

/** Preset -> pure closure. Exported so its math is unit-testable without going through build(). */
export function fieldFor(p: VectorFieldParams): (nx: number, ny: number) => { vx: number; vy: number } {
  const cx = p.centerX;
  const cy = p.centerY;
  switch (p.preset) {
    case "uniform": {
      const rad = (p.angle * Math.PI) / 180;
      const vx = p.magnitude * Math.cos(rad);
      const vy = p.magnitude * Math.sin(rad);
      return () => ({ vx, vy });
    }
    case "radial-outward":
      return (nx, ny) => radialVector(nx, ny, cx, cy, p.magnitude, p.falloff, 1);
    case "radial-inward":
      return (nx, ny) => radialVector(nx, ny, cx, cy, p.magnitude, p.falloff, -1);
    case "dipole": {
      const half = p.separation / 2;
      return (nx, ny) => {
        const src = radialVector(nx, ny, cx - half, cy, p.magnitude, p.falloff, 1);
        const sink = radialVector(nx, ny, cx + half, cy, p.magnitude, p.falloff, -1);
        return { vx: src.vx + sink.vx, vy: src.vy + sink.vy };
      };
    }
    case "vortex":
      return (nx, ny) => {
        const dx = nx - cx;
        const dy = ny - cy;
        const r = Math.hypot(dx, dy);
        if (r < 1e-6) return { vx: 0, vy: 0 };
        const scale = p.magnitude * falloffScale(r, p.falloff);
        return { vx: (-dy / r) * scale, vy: (dx / r) * scale };
      };
  }
}

export const vectorFieldTool: BuilderTool<VectorFieldParams> = {
  name: "physics.vectorField",
  domain: "physics",
  level: "node",
  description: "a grid of arrows sampling a named field shape (uniform/radial source-sink/dipole/vortex) — electric, magnetic, gravity, or flow fields",
  keywords: [
    "vector field",
    "field lines",
    "electric field",
    "magnetic field",
    "gravitational field",
    "flow field",
    "field arrows",
    "vortex",
    "dipole field",
  ],
  params: Params,
  example: {
    preset: "radial-outward",
    angle: 0,
    magnitude: 1,
    centerX: 0.5,
    centerY: 0.5,
    falloff: "inverse-square",
    separation: 0.3,
    width: 420,
    height: 300,
    cols: 8,
    rows: 6,
    normalize: false,
    colorByMagnitude: false,
  },
  build(p) {
    const opts: VectorFieldOptions = {
      x: 0,
      y: 0,
      width: p.width,
      height: p.height,
      cols: p.cols,
      rows: p.rows,
      field: fieldFor(p),
      normalize: p.normalize,
      colorByMagnitude: p.colorByMagnitude,
      ...(p.color ? { color: p.color } : {}),
      ...(p.theme ? { theme: p.theme } : {}),
    };
    return { node: vectorField(opts), bbox: { w: p.width, h: p.height } };
  },
};
