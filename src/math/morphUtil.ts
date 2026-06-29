/**
 * Point-set utilities for shape morphing — pure, deterministic helpers that operate on
 * plain point arrays only (independent of any SVG/path code). They let the engine import
 * a polyline, resample two shapes to a common point count, align their starts, and tween
 * between them so a morph travels the shortest way. No IO, no randomness: same input →
 * identical output (the golden tests depend on this).
 */

/** A 2D point in scene coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** Build `count` independent copies of a point (used for degenerate inputs). */
function repeat(count: number, p: Point): Point[] {
  const out: Point[] = new Array<Point>(count);
  for (let i = 0; i < count; i++) out[i] = { x: p.x, y: p.y };
  return out;
}

/**
 * Resample a polyline to EXACTLY `n` points spaced evenly by arc length. When `closed`,
 * the closing edge (last→first) is included so the points are distributed around the full
 * loop (gap back to the start matches the rest). `n` is clamped to an integer >= 2. A
 * degenerate input (0/1 points, or all identical) returns `n` copies of the first point
 * (or {0,0} when empty). Never produces NaN.
 */
export function resamplePoints(points: Point[], n: number, closed = true): Point[] {
  const count = Math.max(2, Math.floor(n));
  const first: Point = points.length > 0 ? { x: points[0]!.x, y: points[0]!.y } : { x: 0, y: 0 };
  if (points.length < 2) return repeat(count, first);

  // Traversal vertices: append the start vertex on a closed loop so the closing edge counts.
  const verts: Point[] = closed ? [...points, points[0]!] : points;

  // Cumulative arc length to each vertex.
  const cum: number[] = new Array<number>(verts.length);
  cum[0] = 0;
  for (let i = 1; i < verts.length; i++) {
    cum[i] = cum[i - 1]! + Math.hypot(verts[i]!.x - verts[i - 1]!.x, verts[i]!.y - verts[i - 1]!.y);
  }
  const total = cum[verts.length - 1]!;
  if (total === 0) return repeat(count, first); // all points coincide

  // Closed: n equal gaps around the loop. Open: n points spanning first→last inclusive.
  const step = closed ? total / count : total / (count - 1);
  const last = verts[verts.length - 1]!;
  const out: Point[] = new Array<Point>(count);
  let seg = 1; // current segment is verts[seg-1]→verts[seg]; d is monotonic so we only advance
  for (let i = 0; i < count; i++) {
    const d = i * step;
    if (d >= total) {
      out[i] = { x: last.x, y: last.y };
      continue;
    }
    while (seg < verts.length - 1 && cum[seg]! < d) seg++;
    const segStart = cum[seg - 1]!;
    const segLen = cum[seg]! - segStart;
    const t = segLen > 0 ? (d - segStart) / segLen : 0;
    const a = verts[seg - 1]!;
    const b = verts[seg]!;
    out[i] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  return out;
}

/**
 * Re-align two equal-length CLOSED loops: return `pts` cyclically shifted (its start index
 * rotated) to the offset that minimizes the sum of squared distances to `target`, so a
 * morph between them travels the shortest way. If lengths differ, `pts` is returned unchanged.
 */
export function rotateToAlign(target: Point[], pts: Point[]): Point[] {
  const n = pts.length;
  if (target.length !== n || n === 0) return pts;
  let bestOffset = 0;
  let bestCost = Infinity;
  for (let off = 0; off < n; off++) {
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[(i + off) % n]!;
      const tp = target[i]!;
      const dx = p.x - tp.x;
      const dy = p.y - tp.y;
      cost += dx * dx + dy * dy;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestOffset = off;
    }
  }
  const out: Point[] = new Array<Point>(n);
  for (let i = 0; i < n; i++) {
    const p = pts[(i + bestOffset) % n]!;
    out[i] = { x: p.x, y: p.y };
  }
  return out;
}

/**
 * Element-wise linear interpolation between equal-length point arrays:
 * `out[i] = a[i] + (b[i] - a[i]) * t`. If lengths differ, `a` is returned unchanged.
 */
export function lerpPoints(a: Point[], b: Point[], t: number): Point[] {
  if (a.length !== b.length) return a;
  const out: Point[] = new Array<Point>(a.length);
  for (let i = 0; i < a.length; i++) {
    const pa = a[i]!;
    const pb = b[i]!;
    out[i] = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
  }
  return out;
}
