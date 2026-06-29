/**
 * Lewis (electron-dot) structures — a central atom, bonds to ligands (single/double/triple), and lone
 * pairs as dot pairs, with an optional formal charge. Pure builder over primitives; deterministic.
 * Domains are placed on the four cardinal sides first, then diagonals (good for ≤ octet structures).
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme } from "../theme/themes.js";

const DEG = Math.PI / 180;
// Side directions (screen coords: up is −90°). Right then LEFT first, so two ligands sit opposite
// (the textbook linear H–O–H / O=C=O look) and lone pairs fall on the perpendicular sides.
const SIDES = [0, 180, -90, 90, -45, 135, 45, -135];

export interface LewisLigand {
  el: string;
  bonds?: 1 | 2 | 3;
  lonePairs?: number;
}

export interface LewisStructureOptions {
  id?: string;
  x: number;
  y: number;
  center: string;
  ligands: LewisLigand[];
  centerLonePairs?: number;
  charge?: number;
  bondLength?: number;
  theme?: string;
}

export function lewisStructure(opts: LewisStructureOptions): GroupNode {
  const id = opts.id ?? "lewis";
  const theme = getTheme(opts.theme);
  const color = theme.palette.text;
  const cx = opts.x;
  const cy = opts.y;
  const bl = opts.bondLength ?? 64;
  const symR = 13; // clear radius around a symbol where bonds stop
  const children: Node[] = [];
  const dot = (idc: string, x: number, y: number): Node => ({
    id: idc,
    type: "ellipse",
    x: x - 2.5,
    y: y - 2.5,
    width: 5,
    height: 5,
    fill: color,
  });
  const sym = (idc: string, x: number, y: number, t: string): Node => ({
    id: idc,
    type: "text",
    x,
    y,
    text: t,
    fontFamily: "Inter",
    fontWeight: 700,
    fontSize: 22,
    fill: color,
    align: "center",
    baseline: "middle",
  });

  // A lone pair: two dots straddling the radial `ang` at `dist` from `(px,py)`.
  const lonePair = (idc: string, px: number, py: number, ang: number, dist: number): Node[] => {
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const ox = -uy * 4;
    const oy = ux * 4;
    const bx = px + ux * dist;
    const by = py + uy * dist;
    return [dot(`${idc}-a`, bx + ox, by + oy), dot(`${idc}-b`, bx - ox, by - oy)];
  };

  children.push(sym(`${id}-center`, cx, cy, opts.center));

  let side = 0;
  opts.ligands.forEach((lig, i) => {
    const ang = SIDES[side % SIDES.length]! * DEG;
    side++;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const lx = cx + ux * bl;
    const ly = cy + uy * bl;
    // Bond lines (order via perpendicular offset), from the central symbol edge to the ligand edge.
    const a = { x: cx + ux * symR, y: cy + uy * symR };
    const b = { x: lx - ux * symR, y: ly - uy * symR };
    const px = -uy;
    const py = ux;
    const order = lig.bonds ?? 1;
    const offs = order === 1 ? [0] : order === 2 ? [-3.5, 3.5] : [-5, 0, 5];
    offs.forEach((o, k) => {
      children.push({
        id: `${id}-b${i}-${k}`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: a.x + px * o, y: a.y + py * o },
          { x: b.x + px * o, y: b.y + py * o },
        ],
        stroke: color,
        strokeWidth: 2,
      });
    });
    children.push(sym(`${id}-lig${i}`, lx, ly, lig.el));
    // Ligand lone pairs on its outward sides (skip the side facing the centre).
    const lpCount = lig.lonePairs ?? 0;
    const outward = [ang, ang + 90 * DEG, ang - 90 * DEG, ang + 180 * DEG];
    for (let p = 0; p < lpCount && p < outward.length; p++)
      children.push(...lonePair(`${id}-lig${i}-lp${p}`, lx, ly, outward[p]!, symR + 6));
  });

  // Lone pairs on the central atom occupy the next free sides.
  const clp = opts.centerLonePairs ?? 0;
  for (let p = 0; p < clp; p++) {
    const ang = SIDES[side % SIDES.length]! * DEG;
    side++;
    children.push(...lonePair(`${id}-clp${p}`, cx, cy, ang, symR + 5));
  }

  if (opts.charge !== undefined && opts.charge !== 0) {
    const sign = opts.charge > 0 ? "+" : "−";
    const mag = Math.abs(opts.charge);
    children.push({
      id: `${id}-charge`,
      type: "text",
      x: cx + symR + 6,
      y: cy - symR - 4,
      text: mag === 1 ? sign : `${mag}${sign}`,
      fontFamily: "Inter",
      fontWeight: 700,
      fontSize: 14,
      fill: theme.palette.primary,
      align: "left",
      baseline: "middle",
    });
  }
  return { id, type: "group", x: 0, y: 0, children };
}
