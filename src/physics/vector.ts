/**
 * Force / vector diagrams — labeled arrows from a point (a free-body diagram), reusing the diagram
 * connector's arrowheads. Angles are in degrees, math convention (0° = +x, 90° = up); screen y is
 * down. Optional dashed x/y component decomposition. Pure; composes connector + ellipse + text.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import { connector } from "../diagram/connector.js";
import { getTheme, swatch } from "../theme/themes.js";
import { chipRamp, type Depth } from "../theme/depth.js";

export interface Force {
  label?: string;
  /** Arrow length in magnitude units (× `scale` px). */
  magnitude: number;
  /** Direction in degrees, 0 = +x (right), 90 = up. */
  angle: number;
  color?: Color;
}

export interface ForceDiagramOptions {
  /** Node id (and child-id prefix). Defaults to "fd" — pass distinct ids when composing several
   * diagrams into one scene so the ids don't collide. */
  id?: string;
  /** Origin (the body). */
  x: number;
  y: number;
  forces: Force[];
  /** px per magnitude unit. Default 1. */
  scale?: number;
  bodyRadius?: number;
  bodyLabel?: string;
  bodyColor?: Color;
  /** Dashed x/y components for each force. Default false. */
  showComponents?: boolean;
  theme?: string;
  /** Grow the arrows on (draw-on). Default false. */
  animate?: boolean;
  /** Dimensionality of the central body (a spherical highlight). Default "soft"; "flat" = solid. */
  depth?: Depth;
}

const DEG = Math.PI / 180;

export function forceDiagram(opts: ForceDiagramOptions): GroupNode {
  const id = opts.id ?? "fd";
  const theme = getTheme(opts.theme);
  const ox = opts.x;
  const oy = opts.y;
  const scale = opts.scale ?? 1;
  const r = opts.bodyRadius ?? 16;
  const children: Node[] = [];

  opts.forces.forEach((f, i) => {
    const a = f.angle * DEG;
    const ux = Math.cos(a);
    const uy = -Math.sin(a); // screen y is down
    const len = f.magnitude * scale;
    // Base at the body edge; tip a full `len` beyond it — so the visible arrow length is exactly
    // `len` and the tip is always outside the body (no under-length or reversal for small forces).
    const fromX = ox + ux * r;
    const fromY = oy + uy * r;
    const tipX = ox + ux * (r + len);
    const tipY = oy + uy * (r + len);
    const color = f.color ?? swatch(theme, i);

    if (opts.showComponents) {
      const dash = [6, 4];
      children.push({
        id: `${id}-cx-${i}`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: ox, y: oy },
          { x: tipX, y: oy },
        ],
        stroke: color,
        strokeWidth: 1.5,
        dash,
        opacity: 0.6,
      });
      children.push({
        id: `${id}-cy-${i}`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: tipX, y: oy },
          { x: tipX, y: tipY },
        ],
        stroke: color,
        strokeWidth: 1.5,
        dash,
        opacity: 0.6,
      });
    }

    const arrow = connector({
      id: `${id}-f${i}`,
      from: { x: fromX, y: fromY },
      to: { x: tipX, y: tipY },
      stroke: color,
      strokeWidth: 3,
      arrowSize: 14,
      ...(opts.animate ? { progress: 0 } : {}),
    });
    if (opts.animate) {
      const start = 0.2 + i * 0.15;
      const line = arrow.children.find((c) => c.id.endsWith("-line"));
      if (line)
        line.tracks = [
          {
            property: "progress",
            keyframes: [
              { t: start, value: 0 },
              { t: start + 0.6, value: 1, easing: "easeOutCubic" },
            ],
          },
        ] as Track[];
    }
    children.push(arrow);

    if (f.label !== undefined && f.label.trim() !== "") {
      children.push({
        id: `${id}-lbl-${i}`,
        type: "text",
        x: tipX + ux * 12,
        y: tipY + uy * 12,
        text: f.label,
        fontFamily: "Inter",
        fontWeight: 600,
        fontSize: 16,
        fill: color,
        align: ux >= 0 ? "left" : "right",
        baseline: "middle",
      });
    }
  });

  // Central body on top of the arrow bases — a dimensional sphere.
  const bodyColor = opts.bodyColor ?? "#334155";
  const bodyGrad = chipRamp(bodyColor, r, opts.depth ?? "soft");
  children.push({
    id: `${id}-body`,
    type: "ellipse",
    x: ox - r,
    y: oy - r,
    width: r * 2,
    height: r * 2,
    fill: bodyColor,
    ...(bodyGrad ? { gradient: bodyGrad } : {}),
    stroke: "#0f172a",
    strokeWidth: 2,
  });
  if (opts.bodyLabel !== undefined && opts.bodyLabel.trim() !== "") {
    children.push({
      id: `${id}-body-lbl`,
      type: "text",
      x: ox,
      y: oy,
      text: opts.bodyLabel,
      fontFamily: "Inter",
      fontWeight: 700,
      fontSize: Math.round(r * 0.9),
      fill: "#ffffff",
      align: "center",
      baseline: "middle",
    });
  }

  return { id, type: "group", x: 0, y: 0, children };
}
