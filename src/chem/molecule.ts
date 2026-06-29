/**
 * Molecule builder — a 2D structural diagram: atoms as CPK-colored spheres (a radial highlight +
 * soft shadow give depth) joined by single/double/triple bonds. Atom coordinates are in arbitrary
 * units (a bond is ~1 unit) scaled to px. Optionally the atoms pop in and the bonds fade in.
 * Pure; composes ellipse + polyline + text.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import { cpkColor } from "./cpk.js";
import { lighten, readableOn } from "../engine/color.js";

export interface Atom {
  el: string;
  x: number;
  y: number;
}
export interface Bond {
  a: number;
  b: number;
  order?: 1 | 2 | 3;
}

export interface MoleculeOptions {
  id?: string;
  atoms: Atom[];
  bonds?: Bond[];
  /** Px per coordinate unit (a bond is ~1 unit). Default 46. */
  scale?: number;
  /** Origin offset in px (added after scale). Default 0,0. */
  ox?: number;
  oy?: number;
  /** Atom sphere radius in px. Default 18. */
  atomRadius?: number;
  bondColor?: Color;
  bondWidth?: number;
  /** Pop the atoms in and fade the bonds in (a lively assembly). Default false. */
  animate?: boolean;
}

function unit(dx: number, dy: number): { x: number; y: number } {
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

export function molecule(opts: MoleculeOptions): GroupNode {
  const id = opts.id ?? "mol";
  const s = opts.scale ?? 46;
  const ox = opts.ox ?? 0;
  const oy = opts.oy ?? 0;
  const r = opts.atomRadius ?? 18;
  const bondColor = opts.bondColor ?? "#475569";
  const bondWidth = opts.bondWidth ?? 3;
  const pos = opts.atoms.map((a) => ({ x: a.x * s + ox, y: a.y * s + oy }));

  const children: Node[] = [];

  // Bonds first (under the atoms, which cover the line ends).
  (opts.bonds ?? []).forEach((b, i) => {
    const p = pos[b.a];
    const q = pos[b.b];
    if (!p || !q) return;
    const order = b.order ?? 1;
    const d = unit(q.x - p.x, q.y - p.y);
    const perp = { x: -d.y, y: d.x };
    const gap = bondWidth + 2;
    const offsets = order === 1 ? [0] : order === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
    offsets.forEach((off, k) => {
      const line: Node = {
        id: `${id}-bond-${i}-${k}`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: p.x + perp.x * off, y: p.y + perp.y * off },
          { x: q.x + perp.x * off, y: q.y + perp.y * off },
        ],
        stroke: bondColor,
        strokeWidth: bondWidth,
      };
      if (opts.animate)
        line.tracks = [
          {
            property: "opacity",
            keyframes: [
              { t: 0, value: 0 },
              { t: 0.4, value: 1 },
            ],
          },
        ];
      children.push(line);
    });
  });

  // Atoms: CPK sphere (radial-highlight gradient) + soft shadow + readable element label.
  opts.atoms.forEach((atom, i) => {
    const c = pos[i]!;
    const color = cpkColor(atom.el);
    const sphere: Node = {
      id: `${id}-atom-${i}`,
      type: "ellipse",
      x: c.x - r,
      y: c.y - r,
      width: r * 2,
      height: r * 2,
      fill: color,
      gradient: {
        type: "radial",
        center: { x: r, y: r },
        radius: r * 1.05,
        innerCenter: { x: r * 0.62, y: r * 0.58 },
        innerRadius: 0,
        stops: [
          { offset: 0, color: lighten(color, 0.55) },
          { offset: 1, color },
        ],
      },
      shadow: { color: "rgba(15,23,42,0.35)", blur: 6, offsetY: 3 },
      anchor: { x: r, y: r },
    };
    const label: Node = {
      id: `${id}-label-${i}`,
      type: "text",
      x: c.x,
      y: c.y,
      text: atom.el,
      fontFamily: "Inter",
      fontWeight: 700,
      fontSize: Math.round(r * 0.95),
      fill: readableOn(color),
      align: "center",
      baseline: "middle",
      anchor: { x: 0, y: 0 },
    };
    if (opts.animate) {
      const start = 0.2 + i * 0.12;
      const pop: Track[] = [
        {
          property: "scale",
          keyframes: [
            { t: start, value: 0.3 },
            { t: start + 0.4, value: 1, easing: "easeOutBack" },
          ],
        },
        {
          property: "opacity",
          keyframes: [
            { t: start, value: 0 },
            { t: start + 0.3, value: 1 },
          ],
        },
      ];
      sphere.tracks = pop;
      label.tracks = [
        {
          property: "opacity",
          keyframes: [
            { t: start + 0.2, value: 0 },
            { t: start + 0.5, value: 1 },
          ],
        },
      ];
    }
    children.push(sphere, label);
  });

  return { id, type: "group", x: 0, y: 0, children };
}

/** A few ready-made small molecules (coordinates in bond-length units). Pass to `molecule()`. */
export const MOLECULE_PRESETS: Readonly<Record<"water" | "carbonDioxide" | "methane" | "ethanol", { atoms: Atom[]; bonds: Bond[] }>> = {
  water: {
    atoms: [
      { el: "O", x: 0, y: 0 },
      { el: "H", x: -0.82, y: 0.58 },
      { el: "H", x: 0.82, y: 0.58 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 0, b: 2 },
    ],
  },
  carbonDioxide: {
    atoms: [
      { el: "C", x: 0, y: 0 },
      { el: "O", x: -1.2, y: 0 },
      { el: "O", x: 1.2, y: 0 },
    ],
    bonds: [
      { a: 0, b: 1, order: 2 },
      { a: 0, b: 2, order: 2 },
    ],
  },
  methane: {
    atoms: [
      { el: "C", x: 0, y: 0 },
      { el: "H", x: 0, y: -1.05 },
      { el: "H", x: 1.0, y: 0.5 },
      { el: "H", x: -1.0, y: 0.5 },
      { el: "H", x: 0, y: 1.05 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 0, b: 2 },
      { a: 0, b: 3 },
      { a: 0, b: 4 },
    ],
  },
  ethanol: {
    atoms: [
      { el: "C", x: -1, y: 0 },
      { el: "C", x: 0, y: 0 },
      { el: "O", x: 1, y: 0 },
      { el: "H", x: 1.7, y: 0.6 },
    ],
    bonds: [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 3 },
    ],
  },
};
