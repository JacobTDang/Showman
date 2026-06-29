import { describe, it, expect } from "vitest";
import { resamplePoints, rotateToAlign, lerpPoints, type Point } from "../../src/math/morphUtil.js";

const SQUARE: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** True when p lies on the unit-square perimeter (within tol). */
function onUnitSquare(p: Point, tol = 1e-9): boolean {
  const onVert = (Math.abs(p.x) < tol || Math.abs(p.x - 1) < tol) && p.y >= -tol && p.y <= 1 + tol;
  const onHorz = (Math.abs(p.y) < tol || Math.abs(p.y - 1) < tol) && p.x >= -tol && p.x <= 1 + tol;
  return onVert || onHorz;
}

function hasNear(pts: Point[], target: Point, tol = 1e-9): boolean {
  return pts.some((p) => Math.hypot(p.x - target.x, p.y - target.y) < tol);
}

function sqDist(a: Point[], b: Point[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += (a[i]!.x - b[i]!.x) ** 2 + (a[i]!.y - b[i]!.y) ** 2;
  }
  return s;
}

describe("resamplePoints", () => {
  it("resamples a closed unit square to 8 evenly-spaced perimeter points incl. corners", () => {
    const out = resamplePoints(SQUARE, 8, true);
    expect(out.length).toBe(8);
    for (const p of out) expect(onUnitSquare(p)).toBe(true);
    for (const corner of SQUARE) expect(hasNear(out, corner)).toBe(true);
    // Consecutive spacing (incl. the closing gap) ≈ perimeter/8 = 0.5.
    for (let i = 0; i < out.length; i++) {
      const a = out[i]!;
      const b = out[(i + 1) % out.length]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(0.5, 6);
    }
  });

  it("always returns exactly n points", () => {
    for (const n of [2, 3, 5, 16]) {
      expect(resamplePoints(SQUARE, n, true).length).toBe(n);
      expect(resamplePoints(SQUARE, n, false).length).toBe(n);
    }
  });

  it("clamps n to >= 2", () => {
    expect(resamplePoints(SQUARE, 1, true).length).toBe(2);
    expect(resamplePoints(SQUARE, 0, true).length).toBe(2);
  });

  it("handles degenerate inputs without NaN", () => {
    const empty = resamplePoints([], 4, true);
    expect(empty.length).toBe(4);
    for (const p of empty) expect(p).toEqual({ x: 0, y: 0 });

    const single = resamplePoints([{ x: 3, y: 7 }], 5, true);
    expect(single.length).toBe(5);
    for (const p of single) expect(p).toEqual({ x: 3, y: 7 });

    const coincident = resamplePoints(
      [
        { x: 2, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 2 },
      ],
      6,
      true,
    );
    expect(coincident.length).toBe(6);
    for (const p of coincident) {
      expect(Number.isNaN(p.x)).toBe(false);
      expect(Number.isNaN(p.y)).toBe(false);
      expect(p).toEqual({ x: 2, y: 2 });
    }
  });
});

describe("rotateToAlign", () => {
  it("rotates pts to the offset minimizing sq-distance to target", () => {
    const shifted: Point[] = [SQUARE[1]!, SQUARE[2]!, SQUARE[3]!, SQUARE[0]!];
    const aligned = rotateToAlign(SQUARE, shifted);
    // out[0] should be the shifted point closest to target[0].
    expect(aligned[0]).toEqual(SQUARE[0]);
    // Alignment beats the unrotated arrangement.
    expect(sqDist(SQUARE, aligned)).toBeLessThan(sqDist(SQUARE, shifted));
    // And it is the global minimum across all cyclic offsets.
    const n = shifted.length;
    let best = Infinity;
    for (let off = 0; off < n; off++) {
      const cand: Point[] = shifted.map((_, i) => shifted[(i + off) % n]!);
      best = Math.min(best, sqDist(SQUARE, cand));
    }
    expect(sqDist(SQUARE, aligned)).toBeCloseTo(best, 12);
  });

  it("returns pts unchanged when lengths differ", () => {
    const pts: Point[] = [{ x: 1, y: 2 }];
    expect(rotateToAlign(SQUARE, pts)).toBe(pts);
  });
});

describe("lerpPoints", () => {
  const A: Point[] = [
    { x: 0, y: 0 },
    { x: 2, y: 4 },
  ];
  const B: Point[] = [
    { x: 10, y: 0 },
    { x: 4, y: 8 },
  ];

  it("returns a at t=0 and b at t=1", () => {
    expect(lerpPoints(A, B, 0)).toEqual(A);
    expect(lerpPoints(A, B, 1)).toEqual(B);
  });

  it("returns midpoints at t=0.5", () => {
    expect(lerpPoints(A, B, 0.5)).toEqual([
      { x: 5, y: 0 },
      { x: 3, y: 6 },
    ]);
  });

  it("returns a when lengths differ", () => {
    expect(lerpPoints(A, [{ x: 1, y: 1 }], 0.5)).toBe(A);
  });
});
