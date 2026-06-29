/**
 * Box shapes — the node vocabulary of diagrams: process (rect/rounded), decision (diamond),
 * start/end (ellipse), I/O (parallelogram), data store (cylinder), preparation (hexagon). Each is a
 * shape + a centered, wrapped label, returned as a group with connection `ports` so connectors can
 * attach. Pure; composes existing primitives.
 */

import type { Node, GroupNode, Color, Gradient, Shadow } from "../spec/types.js";
import type { Point } from "./connector.js";

export type BoxShape = "rect" | "rounded" | "ellipse" | "diamond" | "parallelogram" | "hexagon" | "cylinder";

export interface BoxOptions {
  /** Node id (and the prefix for child ids). Defaults to "box" — pass distinct ids when composing
   * several builders into one scene (flowchart() namespaces these for you). */
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: BoxShape;
  label?: string;
  fill?: Color;
  stroke?: Color;
  strokeWidth?: number;
  gradient?: Gradient;
  shadow?: Shadow;
  labelColor?: Color;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
}

export interface Box {
  node: GroupNode;
  /** Connection points in scene coordinates. */
  ports: { top: Point; bottom: Point; left: Point; right: Point; center: Point };
}

function shapeNode(id: string, opts: BoxOptions): Node {
  const { x, y, width: w, height: h } = opts;
  const shape = opts.shape ?? "rect";
  const paint = {
    fill: opts.fill ?? "#ffffff",
    ...(opts.stroke !== undefined ? { stroke: opts.stroke } : { stroke: "#334155" }),
    strokeWidth: opts.strokeWidth ?? 2,
    ...(opts.gradient ? { gradient: opts.gradient } : {}),
    ...(opts.shadow ? { shadow: opts.shadow } : {}),
  };
  switch (shape) {
    case "rect":
      return { id, type: "rect", x, y, width: w, height: h, ...paint };
    case "rounded":
      return { id, type: "rect", x, y, width: w, height: h, radius: Math.min(w, h) * 0.18, ...paint };
    case "ellipse":
      return { id, type: "ellipse", x, y, width: w, height: h, ...paint };
    case "diamond":
      return {
        id,
        type: "polyline",
        x: 0,
        y: 0,
        closed: true,
        points: [
          { x: x + w / 2, y },
          { x: x + w, y: y + h / 2 },
          { x: x + w / 2, y: y + h },
          { x, y: y + h / 2 },
        ],
        ...paint,
      };
    case "parallelogram": {
      const s = w * 0.2;
      return {
        id,
        type: "polyline",
        x: 0,
        y: 0,
        closed: true,
        points: [
          { x: x + s, y },
          { x: x + w, y },
          { x: x + w - s, y: y + h },
          { x, y: y + h },
        ],
        ...paint,
      };
    }
    case "hexagon":
      return {
        id,
        type: "polyline",
        x: 0,
        y: 0,
        closed: true,
        points: [
          { x: x + w * 0.25, y },
          { x: x + w * 0.75, y },
          { x: x + w, y: y + h / 2 },
          { x: x + w * 0.75, y: y + h },
          { x: x + w * 0.25, y: y + h },
          { x, y: y + h / 2 },
        ],
        ...paint,
      };
    case "cylinder": {
      const rx = w / 2;
      const ry = h * 0.14;
      const d = `M ${x} ${y + ry} L ${x} ${y + h - ry} A ${rx} ${ry} 0 0 0 ${x + w} ${y + h - ry} L ${x + w} ${y + ry} A ${rx} ${ry} 0 0 0 ${x} ${y + ry} A ${rx} ${ry} 0 0 0 ${x + w} ${y + ry}`;
      return { id, type: "path", x: 0, y: 0, d, ...paint };
    }
  }
}

/** A labeled box of the given shape, with connection ports. */
export function box(opts: BoxOptions): Box {
  const id = opts.id ?? "box";
  const { x, y, width: w, height: h } = opts;
  const shape = opts.shape ?? "rect";
  const children: Node[] = [shapeNode(`${id}-shape`, opts)];
  if (opts.label !== undefined && opts.label.trim() !== "") {
    // Shrink the label to fit a short box vertically, and keep maxWidth positive for tiny boxes.
    const fontSize = Math.min(opts.fontSize ?? 16, Math.max(8, Math.floor(h * 0.42)));
    children.push({
      id: `${id}-label`,
      type: "text",
      x: x + w / 2,
      y: y + h / 2,
      text: opts.label,
      fontFamily: opts.fontFamily ?? "Inter",
      fontWeight: opts.fontWeight ?? 500,
      fontSize,
      fill: opts.labelColor ?? "#1e293b",
      align: "center",
      baseline: "middle",
      maxWidth: Math.max(1, w - 16),
      lineHeight: 1.2,
    });
  }
  // Left/right ports follow the slanted edges of a parallelogram; other shapes use the bounding box.
  const inset = shape === "parallelogram" ? (w * 0.2) / 2 : 0;
  return {
    node: { id, type: "group", x: 0, y: 0, children },
    ports: {
      top: { x: x + w / 2, y },
      bottom: { x: x + w / 2, y: y + h },
      left: { x: x + inset, y: y + h / 2 },
      right: { x: x + w - inset, y: y + h / 2 },
      center: { x: x + w / 2, y: y + h / 2 },
    },
  };
}
