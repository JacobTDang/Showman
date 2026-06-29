/**
 * VSEPR molecular-geometry diagrams — a central atom with terminals at the canonical 2D projection of
 * each electron-domain geometry, plain/wedge/dash bonds for in-plane/front/back, and the characteristic
 * bond angle. Pure builder over primitives; deterministic + golden-safe.
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme } from "../theme/themes.js";

const DEG = Math.PI / 180;

export type Geometry = "linear" | "bent" | "trigonal-planar" | "tetrahedral" | "trigonal-pyramidal" | "octahedral";

interface BondDef {
  ang: number;
  z: "plane" | "front" | "back";
}
// Screen angles (degrees; 0 = right, 90 = down). Canonical 2D projections.
const GEOMETRIES: Record<Geometry, { angle: number; bonds: BondDef[] }> = {
  linear: {
    angle: 180,
    bonds: [
      { ang: 0, z: "plane" },
      { ang: 180, z: "plane" },
    ],
  },
  bent: {
    angle: 104.5,
    bonds: [
      { ang: 38, z: "plane" },
      { ang: 142, z: "plane" },
    ],
  },
  "trigonal-planar": {
    angle: 120,
    bonds: [
      { ang: -90, z: "plane" },
      { ang: 30, z: "plane" },
      { ang: 150, z: "plane" },
    ],
  },
  tetrahedral: {
    angle: 109.5,
    bonds: [
      { ang: -135, z: "plane" },
      { ang: -45, z: "plane" },
      { ang: 45, z: "front" },
      { ang: 135, z: "back" },
    ],
  },
  "trigonal-pyramidal": {
    angle: 107,
    bonds: [
      { ang: 90, z: "plane" },
      { ang: -30, z: "front" },
      { ang: -150, z: "back" },
    ],
  },
  octahedral: {
    angle: 90,
    bonds: [
      { ang: 0, z: "plane" },
      { ang: 90, z: "plane" },
      { ang: 180, z: "plane" },
      { ang: 270, z: "plane" },
      { ang: 45, z: "front" },
      { ang: 225, z: "back" },
    ],
  },
};

export interface VseprShapeOptions {
  id?: string;
  x: number;
  y: number;
  geometry: Geometry;
  center: string;
  terminal?: string;
  bondLength?: number;
  showAngle?: boolean;
  theme?: string;
}

export function vseprShape(opts: VseprShapeOptions): GroupNode {
  const id = opts.id ?? "vsepr";
  const theme = getTheme(opts.theme);
  const color = theme.palette.text;
  const cx = opts.x;
  const cy = opts.y;
  const bl = opts.bondLength ?? 78;
  const r = 16;
  const geo = GEOMETRIES[opts.geometry];
  const term = opts.terminal ?? "X";
  const sym = (idc: string, x: number, y: number, t: string, big = true): Node => ({
    id: idc,
    type: "text",
    x,
    y,
    text: t,
    fontFamily: "Inter",
    fontWeight: 700,
    fontSize: big ? 24 : 20,
    fill: color,
    align: "center",
    baseline: "middle",
  });
  const children: Node[] = [];

  geo.bonds.forEach((b, i) => {
    const a = b.ang * DEG;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const from = { x: cx + ux * r, y: cy + uy * r };
    const to = { x: cx + ux * (bl - r), y: cy + uy * (bl - r) };
    const tip = { x: cx + ux * bl, y: cy + uy * bl };
    if (b.z === "front") {
      // Wedge: filled triangle, narrow at the centre, wide at the terminal (bond toward the viewer).
      const px = -uy;
      const py = ux;
      const wHalf = 6;
      children.push({
        id: `${id}-b${i}`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [from, { x: to.x + px * wHalf, y: to.y + py * wHalf }, { x: to.x - px * wHalf, y: to.y - py * wHalf }],
        closed: true,
        fill: color,
        stroke: color,
        strokeWidth: 1,
      });
    } else if (b.z === "back") {
      children.push({ id: `${id}-b${i}`, type: "polyline", x: 0, y: 0, points: [from, to], stroke: color, strokeWidth: 2, dash: [3, 3] });
    } else {
      children.push({ id: `${id}-b${i}`, type: "polyline", x: 0, y: 0, points: [from, to], stroke: color, strokeWidth: 2 });
    }
    children.push(sym(`${id}-t${i}`, tip.x, tip.y, term, false));
  });

  // Characteristic bond angle between the first two bonds.
  if (opts.showAngle !== false && geo.bonds.length >= 2) {
    const a0 = geo.bonds[0]!.ang;
    const a1 = geo.bonds[1]!.ang;
    const start = Math.min(a0, a1);
    const sweep = Math.abs(a1 - a0);
    children.push({
      id: `${id}-arc`,
      type: "arc",
      x: cx,
      y: cy,
      radius: 30,
      startAngle: start,
      endAngle: start + sweep,
      fill: "transparent",
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
    });
    const midA = (start + sweep / 2) * DEG;
    children.push({
      id: `${id}-ang`,
      type: "text",
      x: cx + Math.cos(midA) * 46,
      y: cy + Math.sin(midA) * 46,
      text: `${geo.angle}°`,
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: theme.palette.muted,
      align: "center",
      baseline: "middle",
    });
  }

  // Central atom on top.
  children.push({ id: `${id}-c-bg`, type: "ellipse", x: cx - r, y: cy - r, width: r * 2, height: r * 2, fill: theme.palette.bg } as Node);
  children.push(sym(`${id}-center`, cx, cy, opts.center));
  return { id, type: "group", x: 0, y: 0, children };
}

export const GEOMETRY_NAMES = Object.keys(GEOMETRIES) as Geometry[];
