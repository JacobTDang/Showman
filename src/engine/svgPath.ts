/**
 * SVG path flattener — pure, deterministic conversion of an SVG `d` string into
 * polylines. Powers path import and shape morphing: every subpath becomes one
 * ordered array of points so the rest of the engine only ever sees `polyline`s.
 *
 * Curves (C/S/Q/T) and elliptical arcs (A) are flattened with a fixed number of
 * sub-steps — no adaptive/float-threshold subdivision — so the same `d` always
 * yields byte-identical points (the golden tests depend on it).
 */

/** A 2-D point in path space. */
export interface Point {
  x: number;
  y: number;
}

/** One token of a `d` string: a command letter or a number (raw text kept for arc flags). */
type Tok = { t: "c"; v: string } | { t: "n"; v: number; raw: string };

// Matches a single-letter command OR an SVG number (sign / decimal / exponent).
// Anything else (spaces, commas) is skipped by the global scan, so implicit
// boundaries like "10-5.5.3" → 10, -5.5, 0.3 fall out for free.
const TOKEN_RE = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;

/** Tokenize a `d` string into commands and numbers, ignoring all separators. */
function tokenize(d: string): Tok[] {
  const out: Tok[] = [];
  for (const m of d.matchAll(TOKEN_RE)) {
    if (m[1] !== undefined) out.push({ t: "c", v: m[1] });
    else out.push({ t: "n", v: parseFloat(m[2]!), raw: m[2]! });
  }
  return out;
}

/**
 * Parse an SVG path `d` and flatten every subpath into a polyline of points.
 * Supports all commands, absolute and relative (M/L/H/V/C/S/Q/T/A/Z). Each `M`
 * starts a new subpath; `Z` closes it by appending the subpath's start point.
 * Invalid/empty input yields `[]`; malformed commands are skipped, never thrown.
 */
export function flattenPath(d: string, opts?: { samplesPerCurve?: number }): Point[][] {
  if (typeof d !== "string" || d.trim() === "") return [];
  const raw = opts?.samplesPerCurve;
  const N = typeof raw === "number" && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 16;

  const toks = tokenize(d);
  const subpaths: Point[][] = [];
  let cur: Point[] | null = null; // active subpath
  let cx = 0,
    cy = 0; // current point
  let sx = 0,
    sy = 0; // current subpath start
  let prevType = ""; // "C" or "Q" if the last command was a (matching) curve
  let ctrlX = 0,
    ctrlY = 0; // last control point, for S/T reflection

  /** Ensure there is an open subpath, lazily starting one at the current point. */
  const ensure = (): Point[] => {
    if (!cur) {
      cur = [{ x: cx, y: cy }];
      subpaths.push(cur);
      sx = cx;
      sy = cy;
    }
    return cur;
  };

  let i = 0;
  /** Read `count` consecutive numbers starting at `i`; advance and return them, or null. */
  const nums = (count: number): number[] | null => {
    if (i + count > toks.length) return null;
    const out: number[] = [];
    for (let k = 0; k < count; k++) {
      const tk = toks[i + k]!;
      if (tk.t !== "n") return null;
      out.push(tk.v);
    }
    i += count;
    return out;
  };

  /**
   * Read an SVG arc flag — a single `0`/`1` digit that may abut the next number
   * (e.g. "…0 11 10 0" packs large=1, sweep=1). Splits the packed digit off and
   * leaves the remainder as the current token for the next read.
   */
  const readFlag = (): number | null => {
    if (i >= toks.length) return null;
    const tk = toks[i]!;
    if (tk.t !== "n") return null;
    const ch = tk.raw[0];
    if (ch !== "0" && ch !== "1") return null;
    const rest = tk.raw.slice(1);
    if (rest === "") i++;
    else toks[i] = { t: "n", v: parseFloat(rest), raw: rest };
    return ch === "1" ? 1 : 0;
  };

  const lineTo = (x: number, y: number): void => {
    ensure().push({ x, y });
    cx = x;
    cy = y;
  };

  const cubicTo = (c1x: number, c1y: number, c2x: number, c2y: number, ex: number, ey: number): void => {
    const arr = ensure();
    const p0x = cx,
      p0y = cy;
    for (let s = 1; s <= N; s++) {
      const t = s / N;
      const mt = 1 - t;
      const a = mt * mt * mt,
        b = 3 * mt * mt * t,
        c = 3 * mt * t * t,
        dd = t * t * t;
      arr.push({ x: a * p0x + b * c1x + c * c2x + dd * ex, y: a * p0y + b * c1y + c * c2y + dd * ey });
    }
    cx = ex;
    cy = ey;
  };

  const quadTo = (qx: number, qy: number, ex: number, ey: number): void => {
    const arr = ensure();
    const p0x = cx,
      p0y = cy;
    for (let s = 1; s <= N; s++) {
      const t = s / N;
      const mt = 1 - t;
      const a = mt * mt,
        b = 2 * mt * t,
        c = t * t;
      arr.push({ x: a * p0x + b * qx + c * ex, y: a * p0y + b * qy + c * ey });
    }
    cx = ex;
    cy = ey;
  };

  /** Flatten an elliptical arc via endpoint→center parameterization (SVG F.6.5). */
  const arcTo = (rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, ex: number, ey: number): void => {
    if (rx === 0 || ry === 0) {
      lineTo(ex, ey);
      return;
    }
    if (cx === ex && cy === ey) return; // zero-length arc — omit entirely per SVG F.6.2
    const arr = ensure();
    const x1 = cx,
      y1 = cy;
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const phi = (phiDeg * Math.PI) / 180;
    const cp = Math.cos(phi),
      sp = Math.sin(phi);
    const dx = (x1 - ex) / 2,
      dy = (y1 - ey) / 2;
    const x1p = cp * dx + sp * dy;
    const y1p = -sp * dx + cp * dy;
    // Scale radii up if they cannot span the chord.
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
      const s = Math.sqrt(lambda);
      rx *= s;
      ry *= s;
    }
    const rx2 = rx * rx,
      ry2 = ry * ry;
    const num = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
    const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
    if (!(den > 0)) {
      // Degenerate (coincident endpoints / non-finite) — straight segment, never NaN.
      lineTo(ex, ey);
      return;
    }
    const co = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
    const cxp = (co * (rx * y1p)) / ry;
    const cyp = (co * -(ry * x1p)) / rx;
    const ccx = cp * cxp - sp * cyp + (x1 + ex) / 2;
    const ccy = sp * cxp + cp * cyp + (y1 + ey) / 2;
    const ux = (x1p - cxp) / rx,
      uy = (y1p - cyp) / ry;
    const vx = (-x1p - cxp) / rx,
      vy = (-y1p - cyp) / ry;
    const ang = (ax: number, ay: number, bx: number, by: number): number => {
      const dot = ax * bx + ay * by;
      const len = Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by)) || 1;
      let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
      if (ax * by - ay * bx < 0) a = -a;
      return a;
    };
    const theta1 = ang(1, 0, ux, uy);
    let dTheta = ang(ux, uy, vx, vy);
    if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
    else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
    for (let s = 1; s <= N; s++) {
      const th = theta1 + (dTheta * s) / N;
      const ct = Math.cos(th),
        st = Math.sin(th);
      arr.push({ x: cp * rx * ct - sp * ry * st + ccx, y: sp * rx * ct + cp * ry * st + ccy });
    }
    cx = ex;
    cy = ey;
  };

  while (i < toks.length) {
    const tk = toks[i]!;
    if (tk.t !== "c") {
      i++; // stray number with no command — skip
      continue;
    }
    i++;
    const cmd = tk.v;
    const rel = cmd === cmd.toLowerCase();
    const up = cmd.toUpperCase();

    switch (up) {
      case "M": {
        let first = true;
        for (;;) {
          const a = nums(2);
          if (!a) break;
          const x = (rel ? cx : 0) + a[0]!;
          const y = (rel ? cy : 0) + a[1]!;
          if (first) {
            cur = [{ x, y }];
            subpaths.push(cur);
            sx = x;
            sy = y;
            cx = x;
            cy = y;
            first = false;
          } else {
            lineTo(x, y); // subsequent pairs are implicit lineto
          }
        }
        prevType = "";
        break;
      }
      case "L": {
        for (;;) {
          const a = nums(2);
          if (!a) break;
          lineTo((rel ? cx : 0) + a[0]!, (rel ? cy : 0) + a[1]!);
        }
        prevType = "";
        break;
      }
      case "H": {
        for (;;) {
          const a = nums(1);
          if (!a) break;
          lineTo((rel ? cx : 0) + a[0]!, cy);
        }
        prevType = "";
        break;
      }
      case "V": {
        for (;;) {
          const a = nums(1);
          if (!a) break;
          lineTo(cx, (rel ? cy : 0) + a[0]!);
        }
        prevType = "";
        break;
      }
      case "C": {
        for (;;) {
          const a = nums(6);
          if (!a) break;
          const bx = rel ? cx : 0,
            by = rel ? cy : 0;
          const c2x = bx + a[2]!,
            c2y = by + a[3]!;
          cubicTo(bx + a[0]!, by + a[1]!, c2x, c2y, bx + a[4]!, by + a[5]!);
          ctrlX = c2x;
          ctrlY = c2y;
        }
        prevType = "C";
        break;
      }
      case "S": {
        for (;;) {
          const a = nums(4);
          if (!a) break;
          const bx = rel ? cx : 0,
            by = rel ? cy : 0;
          const r = prevType === "C";
          const c1x = r ? 2 * cx - ctrlX : cx;
          const c1y = r ? 2 * cy - ctrlY : cy;
          const c2x = bx + a[0]!,
            c2y = by + a[1]!;
          cubicTo(c1x, c1y, c2x, c2y, bx + a[2]!, by + a[3]!);
          ctrlX = c2x;
          ctrlY = c2y;
          prevType = "C";
        }
        prevType = "C";
        break;
      }
      case "Q": {
        for (;;) {
          const a = nums(4);
          if (!a) break;
          const bx = rel ? cx : 0,
            by = rel ? cy : 0;
          const qx = bx + a[0]!,
            qy = by + a[1]!;
          quadTo(qx, qy, bx + a[2]!, by + a[3]!);
          ctrlX = qx;
          ctrlY = qy;
        }
        prevType = "Q";
        break;
      }
      case "T": {
        for (;;) {
          const a = nums(2);
          if (!a) break;
          const bx = rel ? cx : 0,
            by = rel ? cy : 0;
          const r = prevType === "Q";
          const qx = r ? 2 * cx - ctrlX : cx;
          const qy = r ? 2 * cy - ctrlY : cy;
          quadTo(qx, qy, bx + a[0]!, by + a[1]!);
          ctrlX = qx;
          ctrlY = qy;
          prevType = "Q";
        }
        prevType = "Q";
        break;
      }
      case "A": {
        for (;;) {
          const r = nums(3); // rx, ry, x-axis-rotation
          if (!r) break;
          const large = readFlag(); // single-digit flags, possibly packed
          const sweep = readFlag();
          if (large === null || sweep === null) break;
          const xy = nums(2); // endpoint
          if (!xy) break;
          const bx = rel ? cx : 0,
            by = rel ? cy : 0;
          arcTo(r[0]!, r[1]!, r[2]!, large !== 0, sweep !== 0, bx + xy[0]!, by + xy[1]!);
        }
        prevType = "";
        break;
      }
      case "Z": {
        if (cur) {
          cur.push({ x: sx, y: sy }); // close the loop
          cx = sx;
          cy = sy;
        }
        cur = null; // a following draw command starts a fresh subpath at (sx,sy)
        prevType = "";
        break;
      }
      default:
        break; // unknown letter — skip gracefully
    }
  }

  return subpaths;
}
