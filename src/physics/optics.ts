/**
 * Optics — thin-lens ray diagrams (the three principal rays + image formation, all exact build-time
 * geometry) and Snell's-law refraction. Pure + deterministic + golden-safe.
 */

import type { Node, GroupNode, Color, Track } from "../spec/types.js";
import { connector } from "../diagram/connector.js";
import { getTheme } from "../theme/themes.js";

const DEG = Math.PI / 180;

export interface LensOptions {
  id?: string;
  cx: number;
  cy: number;
  height: number;
  type?: "converging" | "diverging";
  color?: Color;
}

/** A thin-lens symbol: a vertical line with arrowheads (outward = converging, inward = diverging). */
export function lens(opts: LensOptions): GroupNode {
  const id = opts.id ?? "lens";
  const color = opts.color ?? "#0ea5e9";
  const h = opts.height;
  const top = opts.cy - h / 2;
  const bot = opts.cy + h / 2;
  const a = 9; // arrowhead size
  const conv = (opts.type ?? "converging") === "converging";
  const head = (y: number, dir: number): Node => ({
    id: `${id}-h${y}`,
    type: "polyline",
    x: 0,
    y: 0,
    points: [
      { x: opts.cx - a, y: y + dir * a },
      { x: opts.cx, y },
      { x: opts.cx + a, y: y + dir * a },
    ],
    stroke: color,
    strokeWidth: 2.5,
    lineJoin: "round",
  });
  return {
    id,
    type: "group",
    x: 0,
    y: 0,
    children: [
      {
        id: `${id}-line`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: opts.cx, y: top },
          { x: opts.cx, y: bot },
        ],
        stroke: color,
        strokeWidth: 2.5,
      },
      head(top, conv ? 1 : -1), // converging: arrows point outward (away from center)
      head(bot, conv ? -1 : 1),
    ],
  };
}

export interface RayDiagramOptions {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Focal length in px. */
  focalLength: number;
  /** Object distance from the lens (px) and height (px, up). */
  object: { distance: number; height: number };
  /** Which principal rays to draw. Default all three. */
  rays?: ("parallel" | "center" | "focal")[];
  theme?: string;
  /** Draw the rays on (staggered). Default false. */
  animate?: boolean;
}

/**
 * A converging-lens ray diagram: the principal axis, the lens, an upright object, the principal rays,
 * and the image where they converge. Handles real (object beyond f) and virtual (within f) images,
 * dashing the virtual image + its back-extended rays.
 */
export function rayDiagram(opts: RayDiagramOptions): GroupNode {
  const id = opts.id ?? "ray";
  const theme = getTheme(opts.theme);
  const f = opts.focalLength;
  const cx = opts.x + opts.width * 0.5;
  const cy = opts.y + opts.height * 0.5;
  const h = opts.object.height;
  const dObj = opts.object.distance;
  const objX = cx - dObj;
  const objTipY = cy - h;

  // Thin-lens equation: 1/di + 1/do = 1/f. di>0 → real (right); di<0 → virtual (left, upright).
  const di = dObj === f ? Infinity : (f * dObj) / (dObj - f);
  const real = Number.isFinite(di) && di > 0;
  const imgX = cx + (Number.isFinite(di) ? di : 0);
  const imgTipY = Number.isFinite(di) ? cy + (h * di) / dObj : cy; // hi = -h·di/do → tipY = cy - hi

  const which = opts.rays ?? ["parallel", "center", "focal"];
  const muted = theme.palette.muted;
  const children: Node[] = [
    {
      id: `${id}-axis`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: opts.x, y: cy },
        { x: opts.x + opts.width, y: cy },
      ],
      stroke: muted,
      strokeWidth: 1.5,
    },
    lens({ id: `${id}-lens`, cx, cy, height: opts.height * 0.62 }),
  ];
  // Focal points.
  for (const fx of [cx - f, cx + f]) {
    children.push({ id: `${id}-F${fx < cx ? "a" : "b"}`, type: "ellipse", x: fx - 3, y: cy - 3, width: 6, height: 6, fill: muted });
    children.push({
      id: `${id}-Flbl${fx < cx ? "a" : "b"}`,
      type: "text",
      x: fx,
      y: cy + 16,
      text: "F",
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 13,
      fill: muted,
      align: "center",
      baseline: "middle",
    });
  }

  const objTip = { x: objX, y: objTipY };
  const imgTip = { x: imgX, y: imgTipY };
  // The lens-plane hit point for each ray, and whether the outgoing segment continues to the image.
  const rayDefs: Record<string, { lensY: number }> = {
    parallel: { lensY: objTipY }, // in parallel to axis, out through the far focus
    center: { lensY: cy }, // straight through the center, undeviated
    focal: { lensY: imgTipY }, // in through the near focus, out parallel to axis
  };
  const rayColors: Record<string, Color> = { parallel: "#dc2626", center: "#16a34a", focal: "#2563eb" };

  which.forEach((rk, i) => {
    const def = rayDefs[rk]!;
    const lensPt = { x: cx, y: rk === "center" ? cy : def.lensY };
    const pts = rk === "center" ? [objTip, imgTip] : [objTip, lensPt, imgTip];
    const ray: Node = {
      id: `${id}-${rk}`,
      type: "polyline",
      x: 0,
      y: 0,
      points: pts,
      stroke: rayColors[rk]!,
      strokeWidth: 2,
      lineJoin: "round",
    };
    if (!real) ray.dash = [6, 4]; // virtual image: the convergence is behind the rays
    if (opts.animate) {
      ray.progress = 0;
      const s = 0.2 + i * 0.25;
      ray.tracks = [
        {
          property: "progress",
          keyframes: [
            { t: s, value: 0 },
            { t: s + 0.7, value: 1, easing: "easeInOutSine" },
          ],
        },
      ] as Track[];
    }
    children.push(ray);
  });

  // Object + image arrows.
  children.push(
    connector({ id: `${id}-obj`, from: { x: objX, y: cy }, to: objTip, stroke: theme.palette.text, strokeWidth: 3, arrowSize: 10 }),
  );
  const imgConn = connector({
    id: `${id}-img`,
    from: { x: imgX, y: cy },
    to: imgTip,
    stroke: theme.palette.primary,
    strokeWidth: 3,
    arrowSize: 10,
  });
  if (!real) for (const c of imgConn.children) c.dash = [6, 4];
  children.push(imgConn);

  return { id, type: "group", x: 0, y: 0, children };
}

export interface SnellOptions {
  id?: string;
  /** Boundary midpoint. */
  x: number;
  y: number;
  width?: number;
  /** Refractive indices (top medium, bottom medium). */
  n1?: number;
  n2?: number;
  /** Incident angle from the normal, degrees. */
  incidentAngle: number;
  theme?: string;
}

/** Snell's-law refraction at a horizontal boundary: incident + refracted rays, the normal, and angles. */
export function snell(opts: SnellOptions): GroupNode {
  const id = opts.id ?? "snell";
  const theme = getTheme(opts.theme);
  const n1 = opts.n1 ?? 1;
  const n2 = opts.n2 ?? 1.5;
  const w = opts.width ?? 320;
  const len = w * 0.42;
  const t1 = opts.incidentAngle * DEG;
  const sinT2 = (n1 / n2) * Math.sin(t1);
  const tir = Math.abs(sinT2) > 1; // total internal reflection
  const t2 = tir ? 0 : Math.asin(sinT2);
  const cx = opts.x;
  const cy = opts.y;
  const muted = theme.palette.muted;
  const children: Node[] = [
    {
      id: `${id}-bound`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cx - w / 2, y: cy },
        { x: cx + w / 2, y: cy },
      ],
      stroke: theme.palette.text,
      strokeWidth: 2,
    },
    {
      id: `${id}-normal`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cx, y: cy - len * 0.9 },
        { x: cx, y: cy + len * 0.9 },
      ],
      stroke: muted,
      strokeWidth: 1.5,
      dash: [5, 4],
    },
  ];
  // Incident ray comes from the upper-left toward the origin (angle t1 from the upward normal).
  const inStart = { x: cx - Math.sin(t1) * len, y: cy - Math.cos(t1) * len };
  children.push(connector({ id: `${id}-in`, from: inStart, to: { x: cx, y: cy }, stroke: "#dc2626", strokeWidth: 2.5, arrowSize: 9 }));
  if (tir) {
    // Reflects back into medium 1 at the same angle.
    const refl = { x: cx + Math.sin(t1) * len, y: cy - Math.cos(t1) * len };
    children.push(connector({ id: `${id}-refl`, from: { x: cx, y: cy }, to: refl, stroke: "#f59e0b", strokeWidth: 2.5, arrowSize: 9 }));
  } else {
    const outEnd = { x: cx + Math.sin(t2) * len, y: cy + Math.cos(t2) * len };
    children.push(connector({ id: `${id}-out`, from: { x: cx, y: cy }, to: outEnd, stroke: "#2563eb", strokeWidth: 2.5, arrowSize: 9 }));
  }
  children.push({
    id: `${id}-n1`,
    type: "text",
    x: cx - w / 2 + 8,
    y: cy - 14,
    text: `n1 = ${n1}`,
    fontFamily: theme.bodyFont,
    fontWeight: 600,
    fontSize: 13,
    fill: muted,
    align: "left",
    baseline: "middle",
  });
  children.push({
    id: `${id}-n2`,
    type: "text",
    x: cx - w / 2 + 8,
    y: cy + 16,
    text: `n2 = ${n2}`,
    fontFamily: theme.bodyFont,
    fontWeight: 600,
    fontSize: 13,
    fill: muted,
    align: "left",
    baseline: "middle",
  });
  return { id, type: "group", x: 0, y: 0, children };
}
