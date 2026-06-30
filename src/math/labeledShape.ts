/**
 * Labeled shape — a geometry teaching figure: a regular polygon with a lettered
 * label (A, B, C, …) at every vertex, optional side-length labels at the edge
 * midpoints, and an optional small angle marker (arc) at the first vertex.
 * Drawn the same way the other math builders compose primitives: themed via
 * `getTheme`, id-namespaced via `idGen`, returning a `GroupNode` placed at
 * (x, y) with children in local coords. Pure function of its options.
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme, idGen, clamp, finiteNum, posSize, intCount } from "./shared.js";
import { fillRamp, type Depth } from "../theme/depth.js";

// ───────────────────────── Labeled shape ─────────────────────────

export interface LabeledShapeOptions {
  id?: string;
  /** Number of polygon sides/vertices (>= 3). */
  sides: number;
  /** Circumradius in px. Vertices sit on a circle of this radius. Default 90. */
  radius?: number;
  /** Top-left placement of the figure's bounding box. */
  x?: number;
  y?: number;
  theme?: string;
  /** When a non-empty string, draws this label at every edge midpoint. */
  sideLabel?: string;
  /** When true, draws a small angle marker at the first vertex. */
  showAngle?: boolean;
  /** Dimensionality of the polygon face (a shaded gradient). Default "soft"; "flat" = solid. */
  depth?: Depth;
}

/** Excel-style vertex name: 0→"A", 25→"Z", 26→"AA", … (always non-empty). */
function vertexName(k: number): string {
  let s = "";
  let n = k;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** A regular polygon with vertex labels, optional side labels, and an optional angle arc. */
export function buildLabeledShape(opts: LabeledShapeOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "shape";
  const nid = idGen(prefix);
  // sides must be a finite integer >= 3 (the polygon node + the renderer require it),
  // capped so a huge count can't explode the node tree.
  const sides = Math.max(3, intCount(opts.sides, 3, 100));
  const radius = posSize(opts.radius, 90);
  const cx = radius;
  const cy = radius;
  const labelSize = clamp(radius * 0.24, 12, 36);
  const sideSize = clamp(radius * 0.18, 10, 28);

  // Vertex positions on the circumscribed circle: vertex k at (-90 + k*360/sides)°.
  const verts: { x: number; y: number }[] = [];
  for (let k = 0; k < sides; k++) {
    const a = ((-90 + (k * 360) / sides) * Math.PI) / 180;
    verts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }

  const children: Node[] = [];

  // The polygon itself (a single polygon node — center at (radius, radius) local).
  const faceGrad = fillRamp(theme.palette.secondary, radius * 2, opts.depth ?? "soft");
  children.push({
    id: nid(),
    type: "polygon",
    x: 0,
    y: 0,
    sides,
    radius,
    fill: theme.palette.secondary,
    ...(faceGrad ? { gradient: faceGrad } : {}),
    stroke: theme.palette.primary,
    strokeWidth: 3,
  });

  // Optional side-length labels at edge midpoints, pushed slightly outward.
  if (typeof opts.sideLabel === "string" && opts.sideLabel.length > 0) {
    for (let k = 0; k < sides; k++) {
      const v0 = verts[k]!;
      const v1 = verts[(k + 1) % sides]!;
      const mx = (v0.x + v1.x) / 2;
      const my = (v0.y + v1.y) / 2;
      const ddx = mx - cx;
      const ddy = my - cy;
      const dist = Math.hypot(ddx, ddy) || 1;
      const off = sideSize * 0.9;
      children.push({
        id: nid(),
        type: "text",
        x: mx + (ddx / dist) * off,
        y: my + (ddy / dist) * off,
        text: opts.sideLabel,
        fontSize: sideSize,
        fontFamily: theme.bodyFont,
        fontWeight: theme.bodyWeight,
        fill: theme.palette.muted,
        align: "center",
        baseline: "middle",
      });
    }
  }

  // Optional angle marker (a small filled sector) tucked into the first vertex,
  // spanning the interior angle between its two adjacent edges.
  if (opts.showAngle === true) {
    const v0 = verts[0]!;
    const next = verts[1]!;
    const prev = verts[sides - 1]!;
    // Direction (degrees CW from 12 o'clock) from the vertex toward a neighbor.
    const dirDeg = (to: { x: number; y: number }) => (Math.atan2(to.y - v0.y, to.x - v0.x) * 180) / Math.PI + 90;
    const start = dirDeg(next);
    // Normalize the sweep to the shorter (interior) side, within (-180, 180].
    let sweep = dirDeg(prev) - start;
    while (sweep <= -180) sweep += 360;
    while (sweep > 180) sweep -= 360;
    const ar = clamp(radius * 0.22, 8, 40);
    children.push({
      id: nid(),
      type: "arc",
      x: v0.x - ar,
      y: v0.y - ar,
      radius: ar,
      startAngle: start,
      endAngle: start + sweep,
      fill: theme.palette.accent,
      opacity: 0.7,
    });
  }

  // Vertex labels (A, B, C, …) pushed just outside each vertex.
  for (let k = 0; k < sides; k++) {
    const a = ((-90 + (k * 360) / sides) * Math.PI) / 180;
    const lr = radius + labelSize * 0.85;
    children.push({
      id: nid(),
      type: "text",
      x: cx + lr * Math.cos(a),
      y: cy + lr * Math.sin(a),
      text: vertexName(k),
      fontSize: labelSize,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.text,
      align: "center",
      baseline: "middle",
    });
  }

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
