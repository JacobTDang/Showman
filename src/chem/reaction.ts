/**
 * Reaction builder — lays out `reactants + … -> products + …` with mhchem formulas joined by plus
 * signs and a labeled reaction arrow (conditions over it). The arrow can sweep in (draw-on) for a
 * lively reaction. Pure; composes the chem equation typesetter + the diagram connector.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";
import { chemEquation } from "./equation.js";
import { connector } from "../diagram/connector.js";

export interface ReactionOptions {
  /** Node id (and the prefix for child ids). Defaults to "rxn" — pass distinct ids when composing
   * several reactions into one scene so their child ids don't collide. */
  id?: string;
  /** Reactant formulas (mhchem syntax, no \ce), e.g. ["2H2", "O2"]. */
  reactants: string[];
  products: string[];
  /** Text over the arrow (e.g. "Δ", "catalyst"). */
  conditions?: string;
  x?: number;
  y?: number;
  size?: number;
  color?: Color;
  theme?: string;
  arrowColor?: Color;
  gap?: number;
  /** Sweep the arrow on (draw-on). Default false. */
  animateArrow?: boolean;
}

export function reaction(opts: ReactionOptions): GroupNode {
  const id = opts.id ?? "rxn";
  const size = opts.size ?? 34;
  const gap = opts.gap ?? 16;
  const color = opts.color ?? "#1e293b";
  const arrowColor = opts.arrowColor ?? "#334155";
  const x0 = opts.x ?? 0;
  const y0 = opts.y ?? 0;

  const r = (list: string[], side: string) =>
    list.map((f, i) => ({
      side,
      i,
      ...chemEquation({ formula: f, size, color, ...(opts.theme !== undefined ? { theme: opts.theme } : {}), id: `${id}-${side}${i}` }),
    }));
  // Drop empty/invalid formulas (no rendered glyphs) entirely — otherwise their joining "+" dangles.
  const reactants = r(opts.reactants, "r").filter((e) => e.node.children.length > 0);
  const products = r(opts.products, "p").filter((e) => e.node.children.length > 0);
  const maxH = Math.max(size, ...reactants.map((e) => e.height), ...products.map((e) => e.height));
  const centerY = y0 + maxH / 2;

  const children: Node[] = [];
  let cx = x0;
  const plus = (key: string): void => {
    children.push({
      id: `${id}-plus-${key}`,
      type: "text",
      x: cx + size * 0.3,
      y: centerY,
      text: "+",
      fontFamily: "Inter",
      fontWeight: 600,
      fontSize: Math.round(size * 0.8),
      fill: color,
      align: "center",
      baseline: "middle",
    });
    cx += size * 0.6 + gap;
  };
  const place = (e: { node: GroupNode; width: number; height: number }): void => {
    e.node.x = cx;
    e.node.y = y0 + (maxH - e.height) / 2;
    children.push(e.node);
    cx += e.width + gap;
  };

  reactants.forEach((e, i) => {
    if (i > 0) plus(`r${i}`);
    place(e);
  });

  const arrowStart = cx + gap;
  const arrowEnd = arrowStart + size * 2.4;
  const arrow = connector({
    id: `${id}-arrow`,
    from: { x: arrowStart, y: centerY },
    to: { x: arrowEnd, y: centerY },
    stroke: arrowColor,
    strokeWidth: 2.5,
    ...(opts.conditions !== undefined ? { label: opts.conditions, labelColor: color, fontSize: Math.round(size * 0.5) } : {}),
    ...(opts.animateArrow ? { progress: 0 } : {}),
  });
  if (opts.animateArrow) {
    const line = arrow.children.find((c) => c.id.endsWith("-line"));
    if (line)
      line.tracks = [
        {
          property: "progress",
          keyframes: [
            { t: 0.6, value: 0 },
            { t: 1.4, value: 1, easing: "easeOutCubic" },
          ],
        },
      ];
  }
  children.push(arrow);
  cx = arrowEnd + gap * 1.5;

  products.forEach((e, i) => {
    if (i > 0) plus(`p${i}`);
    place(e);
  });

  return { id, type: "group", x: 0, y: 0, children };
}
