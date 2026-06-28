/**
 * Geometry angle builder — composes engine primitives (polyline, arc, ellipse,
 * text) into a labelled angle: a vertex with two rays and a wedge arc marking the
 * opening between them. Returns a GroupNode you drop into a scene's `nodes`.
 *
 * Like the other math builders this is a PURE function of its options (same opts
 * -> identical spec) and namespaces every child id by an `id` prefix.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";
import { getTheme, idGen, finiteNum, posSize } from "./shared.js";

// ───────────────────────── Geometry angle ─────────────────────────

export interface AngleOptions {
  id?: string;
  /** The angle's opening in degrees, measured counter-clockwise (upward on screen) from ray A. */
  degrees: number;
  /** Top-left placement of the group; the vertex sits at this origin. */
  x?: number;
  y?: number;
  /** Pixel length of each ray. Default 90. */
  rayLength?: number;
  theme?: string;
  /** Label near the arc. Default `${degrees}°`. */
  label?: string;
  /** Ray + vertex color. Default theme primary. */
  color?: Color;
}

/**
 * A themed angle: vertex at the group origin, ray A horizontal to the right, ray B
 * rotated `degrees` counter-clockwise (upward, so its dy is negative), an arc wedge
 * marking the opening, and a degree label near the arc's midangle.
 *
 * Arc angles are degrees CLOCKWISE from 12 o'clock, so a math angle θ (CCW from the
 * +x axis) sits at clockwise-from-top angle `90 - θ`; the wedge from ray A to ray B
 * therefore spans `startAngle = 90 - degrees` to `endAngle = 90`.
 */
export function buildAngle(opts: AngleOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "angle";
  const nid = idGen(prefix);
  const rayLength = posSize(opts.rayLength, 90);
  const color = opts.color ?? theme.palette.primary;
  // Clamp the opening into a finite 0..360 range so rays, arc angles, and the
  // label never go non-finite (NaN/Infinity would produce an invalid spec).
  const degrees = finiteNum(opts.degrees, 0, 0, 360);

  // Ray B endpoint in local pixels: CCW math angle θ → screen y is negative (up).
  const rad = (degrees * Math.PI) / 180;
  const bx = rayLength * Math.cos(rad);
  const by = -rayLength * Math.sin(rad);

  // Small arc near the vertex marking the opening; its center sits on the vertex,
  // so the arc node (whose center is local (radius, radius)) is offset by -radius.
  const arcRadius = rayLength * 0.35;
  const startAngle = 90 - degrees; // ray B, clockwise-from-top
  const endAngle = 90; // ray A (+x), clockwise-from-top

  // Degree label just beyond the arc, at the opening's midangle.
  const midRad = (degrees / 2) * (Math.PI / 180);
  const labelR = arcRadius + 22;

  const children: Node[] = [
    // Wedge marking the angle (drawn first so the rays sit on top).
    {
      id: nid(),
      type: "arc",
      x: -arcRadius,
      y: -arcRadius,
      radius: arcRadius,
      startAngle,
      endAngle,
      fill: theme.palette.accent,
    },
    // Ray A — horizontal to the right.
    {
      id: nid(),
      type: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: rayLength, y: 0 },
      ],
      stroke: color,
      strokeWidth: 4,
      lineCap: "round",
    },
    // Ray B — rotated `degrees` counter-clockwise.
    {
      id: nid(),
      type: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: bx, y: by },
      ],
      stroke: color,
      strokeWidth: 4,
      lineCap: "round",
    },
    // Vertex dot.
    {
      id: nid(),
      type: "ellipse",
      x: -5,
      y: -5,
      width: 10,
      height: 10,
      fill: color,
    },
    // Degree label near the arc midangle.
    {
      id: nid(),
      type: "text",
      x: labelR * Math.cos(midRad),
      y: -labelR * Math.sin(midRad),
      text: opts.label ?? `${degrees}°`,
      fontSize: 18,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.text,
      align: "center",
      baseline: "middle",
    },
  ];

  return { id: prefix, type: "group", x: finiteNum(opts.x, 0), y: finiteNum(opts.y, 0), children };
}
