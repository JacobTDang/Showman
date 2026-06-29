/**
 * Connectors — the boxes-and-arrows vocabulary of technical diagrams (flowcharts, UML, ER,
 * architecture). A connector is a line (straight / elbow / curved) with optional arrowheads and a
 * mid-label, composed entirely from existing primitives (polyline/path/text/rect). Pure +
 * deterministic; coordinates are in scene space.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";

export interface Point {
  x: number;
  y: number;
}

export type ArrowHead = "none" | "arrow" | "open" | "diamond" | "circle";
export type Routing = "straight" | "elbow" | "curved";

export interface ConnectorOptions {
  /** Node id (and the prefix for child ids). Defaults to "conn" — pass distinct ids when composing
   * several builders into one scene so their child ids don't collide (flowchart() does this for you). */
  id?: string;
  from: Point;
  to: Point;
  routing?: Routing;
  /** Arrowhead at the `to` end. Default "arrow". */
  endArrow?: ArrowHead;
  /** Arrowhead at the `from` end. Default "none". */
  startArrow?: ArrowHead;
  stroke?: Color;
  strokeWidth?: number;
  /** Dash pattern for the line (e.g. a "planned/optional" edge). */
  dash?: number[];
  /** Arrowhead size in px. Default 12. */
  arrowSize?: number;
  /** A label drawn at the midpoint (on a chip for legibility). */
  label?: string;
  labelColor?: Color;
  /** Chip color behind the label; omit for no chip. */
  labelBg?: Color;
  fontFamily?: string;
  fontSize?: number;
  /** Draw-on progress 0..1 for the line. Default 1. Animatable on the line node. */
  progress?: number;
}

function unit(dx: number, dy: number): Point {
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/** Orthogonal "elbow" waypoints from a→b: leave along the dominant axis, turn once. */
function elbowPoints(a: Point, b: Point): Point[] {
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
    const midX = (a.x + b.x) / 2;
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  }
  const midY = (a.y + b.y) / 2;
  return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
}

/** The arrowhead shape at `tip`, pointing along unit direction `dir`. */
function arrowHead(id: string, kind: ArrowHead, tip: Point, dir: Point, size: number, color: Color): Node | null {
  if (kind === "none") return null;
  const perp = { x: -dir.y, y: dir.x };
  const back = { x: tip.x - dir.x * size, y: tip.y - dir.y * size };
  if (kind === "circle") {
    const r = size * 0.45;
    return { id, type: "ellipse", x: tip.x - r, y: tip.y - r, width: r * 2, height: r * 2, fill: color };
  }
  if (kind === "diamond") {
    const mid = { x: tip.x - dir.x * size * 0.5, y: tip.y - dir.y * size * 0.5 };
    const pts = [
      tip,
      { x: mid.x + perp.x * size * 0.4, y: mid.y + perp.y * size * 0.4 },
      back,
      { x: mid.x - perp.x * size * 0.4, y: mid.y - perp.y * size * 0.4 },
    ];
    return { id, type: "polyline", x: 0, y: 0, points: pts, closed: true, fill: color, stroke: color, strokeWidth: 1 };
  }
  const w = size * 0.5;
  const b1 = { x: back.x + perp.x * w, y: back.y + perp.y * w };
  const b2 = { x: back.x - perp.x * w, y: back.y - perp.y * w };
  if (kind === "open") {
    // A "V" — two strokes, not filled.
    return { id, type: "polyline", x: 0, y: 0, points: [b1, tip, b2], stroke: color, strokeWidth: 2 };
  }
  // "arrow": a filled triangle.
  return { id, type: "polyline", x: 0, y: 0, points: [tip, b1, b2], closed: true, fill: color, stroke: color, strokeWidth: 1 };
}

/** Build a connector (line + arrowheads + optional label) as a group. */
export function connector(opts: ConnectorOptions): GroupNode {
  const id = opts.id ?? "conn";
  const stroke = opts.stroke ?? "#334155";
  const strokeWidth = opts.strokeWidth ?? 2;
  const size = opts.arrowSize ?? 12;
  const routing = opts.routing ?? "straight";
  const endArrow = opts.endArrow ?? "arrow";
  const startArrow = opts.startArrow ?? "none";
  const { from, to } = opts;

  const children: Node[] = [];
  let endDir: Point;
  let startDir: Point;
  let mid: Point;

  if (routing === "curved") {
    const dir = unit(to.x - from.x, to.y - from.y);
    const perp = { x: -dir.y, y: dir.x };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const bow = dist * 0.2;
    const c1 = { x: from.x + dir.x * dist * 0.33 + perp.x * bow, y: from.y + dir.y * dist * 0.33 + perp.y * bow };
    const c2 = { x: from.x + dir.x * dist * 0.66 + perp.x * bow, y: from.y + dir.y * dist * 0.66 + perp.y * bow };
    children.push({
      id: `${id}-line`,
      type: "path",
      x: 0,
      y: 0,
      d: `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`,
      stroke,
      strokeWidth,
      ...(opts.dash ? { dash: opts.dash } : {}),
      ...(opts.progress !== undefined ? { progress: opts.progress } : {}),
    });
    endDir = unit(to.x - c2.x, to.y - c2.y);
    startDir = unit(from.x - c1.x, from.y - c1.y);
    mid = {
      x: 0.125 * from.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * to.x,
      y: 0.125 * from.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * to.y,
    };
  } else {
    const pts = routing === "elbow" ? elbowPoints(from, to) : [from, to];
    children.push({
      id: `${id}-line`,
      type: "polyline",
      x: 0,
      y: 0,
      points: pts,
      stroke,
      strokeWidth,
      ...(opts.dash ? { dash: opts.dash } : {}),
      ...(opts.progress !== undefined ? { progress: opts.progress } : {}),
    });
    const last = pts[pts.length - 2]!;
    endDir = unit(to.x - last.x, to.y - last.y);
    startDir = unit(from.x - pts[1]!.x, from.y - pts[1]!.y);
    // Geometric midpoint of the path (not a vertex): the middle of the middle segment for elbow,
    // the line midpoint for straight — so the label sits on the line, never on the endpoint.
    mid =
      routing === "elbow"
        ? { x: (pts[1]!.x + pts[2]!.x) / 2, y: (pts[1]!.y + pts[2]!.y) / 2 }
        : { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  }

  const head = arrowHead(`${id}-end`, endArrow, to, endDir, size, stroke);
  if (head) children.push(head);
  const tail = arrowHead(`${id}-start`, startArrow, from, startDir, size, stroke);
  if (tail) children.push(tail);

  if (opts.label !== undefined && opts.label.trim() !== "") {
    const fontSize = opts.fontSize ?? 14;
    if (opts.labelBg !== undefined) {
      const w = opts.label.length * fontSize * 0.6 + 10;
      children.push({
        id: `${id}-label-bg`,
        type: "rect",
        x: mid.x - w / 2,
        y: mid.y - fontSize * 0.8,
        width: w,
        height: fontSize * 1.6,
        radius: 4,
        fill: opts.labelBg,
      });
    }
    children.push({
      id: `${id}-label`,
      type: "text",
      x: mid.x,
      y: mid.y,
      text: opts.label,
      fontSize,
      fontFamily: opts.fontFamily ?? "Inter",
      fill: opts.labelColor ?? "#334155",
      align: "center",
      baseline: "middle",
    });
  }

  return { id, type: "group", x: 0, y: 0, children };
}
