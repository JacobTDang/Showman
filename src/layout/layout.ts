/**
 * Layout geometry — pure box math for composing scenes (slides, grids, columns) instead of the
 * magic-number positioning lessons use today. Everything is a deterministic function of the inputs:
 * a `Box` in, `Box`es out. No rendering, no node types — builders consume these to place nodes.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Inset = number | { top?: number; right?: number; bottom?: number; left?: number };

/** The full frame box for a scene of the given size. */
export function frame(width: number, height: number): Box {
  return { x: 0, y: 0, width, height };
}

/** Shrink a box by a uniform or per-side inset → the safe content area. */
export function inset(box: Box, m: Inset): Box {
  const t = typeof m === "number" ? m : (m.top ?? 0);
  const r = typeof m === "number" ? m : (m.right ?? 0);
  const b = typeof m === "number" ? m : (m.bottom ?? 0);
  const l = typeof m === "number" ? m : (m.left ?? 0);
  return { x: box.x + l, y: box.y + t, width: Math.max(0, box.width - l - r), height: Math.max(0, box.height - t - b) };
}

/** Center a `w`×`h` box inside `area`. */
export function center(area: Box, w: number, h: number): Box {
  return { x: area.x + (area.width - w) / 2, y: area.y + (area.height - h) / 2, width: w, height: h };
}

/** Split `area` into `count` rows. `gap` between; `itemHeight` for a fixed height (else equal share). */
export function column(area: Box, count: number, opts: { gap?: number; itemHeight?: number } = {}): Box[] {
  if (count <= 0) return [];
  const gap = opts.gap ?? 0;
  const h = opts.itemHeight ?? (area.height - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: area.x, y: area.y + i * (h + gap), width: area.width, height: h }));
}

/** Split `area` into `count` columns. `gap` between; `itemWidth` for a fixed width (else equal share). */
export function row(area: Box, count: number, opts: { gap?: number; itemWidth?: number } = {}): Box[] {
  if (count <= 0) return [];
  const gap = opts.gap ?? 0;
  const w = opts.itemWidth ?? (area.width - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: area.x + i * (w + gap), y: area.y, width: w, height: area.height }));
}

/** A `rows`×`cols` grid of cells within `area`, in row-major order. */
export function grid(area: Box, rows: number, cols: number, gap: number | { x: number; y: number } = 0): Box[] {
  if (rows <= 0 || cols <= 0) return [];
  const gx = typeof gap === "number" ? gap : gap.x;
  const gy = typeof gap === "number" ? gap : gap.y;
  const w = (area.width - gx * (cols - 1)) / cols;
  const h = (area.height - gy * (rows - 1)) / rows;
  const out: Box[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: area.x + c * (w + gx), y: area.y + r * (h + gy), width: w, height: h });
    }
  }
  return out;
}

/** The center point of a box. */
export function centerOf(box: Box): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
