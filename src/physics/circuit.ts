/**
 * Circuit schematics — a small symbol set (resistor, battery, capacitor, lamp, ground) plus a wire
 * that can show "current" as marching ants. Each symbol is horizontal with terminals `a` (left) and
 * `b` (right) for wiring. Pure; composes polyline + ellipse + text.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";

export interface Point {
  x: number;
  y: number;
}
export interface SymbolOptions {
  /** Node id (and child-id prefix). Each symbol defaults to its own ("res"/"bat"/…) — pass distinct
   * ids when composing several of the same type into one scene so the ids don't collide. */
  id?: string;
  x: number;
  y: number;
  /** Symbol width in px; must be > 0. Default 70. */
  size?: number;
  color?: Color;
  label?: string;
}
export interface CircuitSymbol {
  node: GroupNode;
  a: Point;
  b: Point;
}

const SW = 2.5;
const poly = (id: string, points: Point[], color: Color, w = SW): Node => ({
  id,
  type: "polyline",
  x: 0,
  y: 0,
  points,
  stroke: color,
  strokeWidth: w,
});

function withLabel(id: string, opts: SymbolOptions, body: Node[], color: Color): CircuitSymbol {
  const { x, y } = opts;
  const size = opts.size ?? 70;
  const children = [...body];
  if (opts.label !== undefined && opts.label.trim() !== "") {
    children.push({
      id: `${id}-lbl`,
      type: "text",
      x: x + size / 2,
      y: y - size * 0.32,
      text: opts.label,
      fontFamily: "Inter",
      fontWeight: 600,
      fontSize: 15,
      fill: color,
      align: "center",
      baseline: "middle",
    });
  }
  return { node: { id, type: "group", x: 0, y: 0, children }, a: { x, y }, b: { x: x + size, y } };
}

export function resistor(opts: SymbolOptions): CircuitSymbol {
  const id = opts.id ?? "res";
  const { x, y } = opts;
  const size = opts.size ?? 70;
  const color = opts.color ?? "#1e293b";
  const lead = size * 0.18;
  const bL = x + lead;
  const bR = x + size - lead;
  const w = bR - bL;
  const segs = 6;
  const amp = 9;
  const zig: Point[] = [{ x: bL, y }];
  for (let i = 0; i < segs; i++) zig.push({ x: bL + (w * (i + 0.5)) / segs, y: y + (i % 2 === 0 ? -amp : amp) });
  zig.push({ x: bR, y });
  return withLabel(
    id,
    opts,
    [
      poly(
        `${id}-l`,
        [
          { x, y },
          { x: bL, y },
        ],
        color,
      ),
      poly(`${id}-z`, zig, color),
      poly(
        `${id}-r`,
        [
          { x: bR, y },
          { x: x + size, y },
        ],
        color,
      ),
    ],
    color,
  );
}

export function battery(opts: SymbolOptions): CircuitSymbol {
  const id = opts.id ?? "bat";
  const { x, y } = opts;
  const size = opts.size ?? 70;
  const color = opts.color ?? "#1e293b";
  const cx = x + size / 2;
  const gap = 7;
  const longH = 18;
  const shortH = 9;
  return withLabel(
    id,
    opts,
    [
      poly(
        `${id}-l`,
        [
          { x, y },
          { x: cx - gap, y },
        ],
        color,
      ),
      poly(
        `${id}-long`,
        [
          { x: cx - gap, y: y - longH / 2 },
          { x: cx - gap, y: y + longH / 2 },
        ],
        color,
      ),
      poly(
        `${id}-short`,
        [
          { x: cx + gap, y: y - shortH / 2 },
          { x: cx + gap, y: y + shortH / 2 },
        ],
        color,
        SW + 1.5,
      ),
      poly(
        `${id}-r`,
        [
          { x: cx + gap, y },
          { x: x + size, y },
        ],
        color,
      ),
    ],
    color,
  );
}

export function capacitor(opts: SymbolOptions): CircuitSymbol {
  const id = opts.id ?? "cap";
  const { x, y } = opts;
  const size = opts.size ?? 70;
  const color = opts.color ?? "#1e293b";
  const cx = x + size / 2;
  const gap = 6;
  const h = 18;
  return withLabel(
    id,
    opts,
    [
      poly(
        `${id}-l`,
        [
          { x, y },
          { x: cx - gap, y },
        ],
        color,
      ),
      poly(
        `${id}-p1`,
        [
          { x: cx - gap, y: y - h / 2 },
          { x: cx - gap, y: y + h / 2 },
        ],
        color,
        SW + 0.5,
      ),
      poly(
        `${id}-p2`,
        [
          { x: cx + gap, y: y - h / 2 },
          { x: cx + gap, y: y + h / 2 },
        ],
        color,
        SW + 0.5,
      ),
      poly(
        `${id}-r`,
        [
          { x: cx + gap, y },
          { x: x + size, y },
        ],
        color,
      ),
    ],
    color,
  );
}

export function lamp(opts: SymbolOptions): CircuitSymbol {
  const id = opts.id ?? "lamp";
  const { x, y } = opts;
  const size = opts.size ?? 70;
  const color = opts.color ?? "#1e293b";
  const r = size * 0.22;
  const cx = x + size / 2;
  const d = r * Math.SQRT1_2;
  return withLabel(
    id,
    opts,
    [
      poly(
        `${id}-l`,
        [
          { x, y },
          { x: cx - r, y },
        ],
        color,
      ),
      {
        id: `${id}-bulb`,
        type: "ellipse",
        x: cx - r,
        y: y - r,
        width: r * 2,
        height: r * 2,
        fill: "transparent",
        stroke: color,
        strokeWidth: SW,
      },
      poly(
        `${id}-x1`,
        [
          { x: cx - d, y: y - d },
          { x: cx + d, y: y + d },
        ],
        color,
      ),
      poly(
        `${id}-x2`,
        [
          { x: cx - d, y: y + d },
          { x: cx + d, y: y - d },
        ],
        color,
      ),
      poly(
        `${id}-r`,
        [
          { x: cx + r, y },
          { x: x + size, y },
        ],
        color,
      ),
    ],
    color,
  );
}

export function ground(opts: SymbolOptions): CircuitSymbol {
  const id = opts.id ?? "gnd";
  const { x, y } = opts;
  const size = opts.size ?? 40;
  const color = opts.color ?? "#1e293b";
  const cx = x;
  return {
    node: {
      id,
      type: "group",
      x: 0,
      y: 0,
      children: [
        poly(
          `${id}-l`,
          [
            { x: cx, y },
            { x: cx, y: y + size * 0.4 },
          ],
          color,
        ),
        poly(
          `${id}-b1`,
          [
            { x: cx - 14, y: y + size * 0.4 },
            { x: cx + 14, y: y + size * 0.4 },
          ],
          color,
        ),
        poly(
          `${id}-b2`,
          [
            { x: cx - 9, y: y + size * 0.4 + 6 },
            { x: cx + 9, y: y + size * 0.4 + 6 },
          ],
          color,
        ),
        poly(
          `${id}-b3`,
          [
            { x: cx - 4, y: y + size * 0.4 + 12 },
            { x: cx + 4, y: y + size * 0.4 + 12 },
          ],
          color,
        ),
      ],
    },
    a: { x: cx, y },
    b: { x: cx, y },
  };
}

export interface WireOptions {
  id?: string;
  points: Point[];
  color?: Color;
  width?: number;
  /** Show current as marching ants (animated dash). Default false. */
  current?: boolean;
}

export function wire(opts: WireOptions): Node {
  const id = opts.id ?? "wire";
  const node: Node = {
    id,
    type: "polyline",
    x: 0,
    y: 0,
    points: opts.points,
    stroke: opts.color ?? "#1e293b",
    strokeWidth: opts.width ?? SW,
  };
  if (opts.current) {
    node.dash = [9, 7];
    node.dashOffset = 0;
    node.tracks = [
      {
        property: "dashOffset",
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: -16 },
        ],
      },
    ] as Track[];
  }
  return node;
}
