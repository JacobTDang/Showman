/**
 * Icon builder — render a named icon from the frozen path table at a position and size, via the
 * deterministic `path` primitive. Stroked icons keep a constant visual stroke width regardless of
 * size; filled icons paint solid. Returns a single `path` node.
 */

import type { Node, Color } from "../spec/types.js";
import { ICONS } from "./icons.js";

export interface IconOptions {
  id?: string;
  /** Icon name (see `iconNames()`). Unknown names render nothing. */
  name: string;
  x: number;
  y: number;
  /** Box size in px (the icon's 24-unit grid scales to this). Default 24. */
  size?: number;
  color?: Color;
  /** Visual stroke width in px (stroked icons). Default 2. */
  strokeWidth?: number;
  /** Force fill on/off (default follows the icon's own `fill`). */
  fill?: boolean;
}

export function icon(opts: IconOptions): Node {
  const id = opts.id ?? "icon";
  const def = ICONS[opts.name];
  const size = opts.size ?? 24;
  const color = opts.color ?? "#1e293b";
  // Unknown icon, or a non-positive box, has nothing to draw (and a 0 size would make strokeWidth ∞).
  if (!def || !Number.isFinite(size) || size <= 0) return { id, type: "group", x: opts.x, y: opts.y, children: [] };
  const s = size / 24;
  const filled = opts.fill ?? def.fill ?? false;
  const base: Node = { id, type: "path", x: opts.x, y: opts.y, d: def.d, scaleX: s, scaleY: s, lineCap: "round", lineJoin: "round" };
  if (filled) {
    return { ...base, fill: color };
  }
  // Stroked: transparent fill, and pre-divide the stroke so the post-scale visual width is constant.
  return { ...base, fill: "transparent", stroke: color, strokeWidth: (opts.strokeWidth ?? 2) / s };
}
