import { describe, it, expect } from "vitest";
import { flattenPath } from "../../src/engine/svgPath.js";
import type { Point } from "../../src/engine/svgPath.js";

/** True when some point in `pts` lies within `eps` of (x, y). */
function has(pts: Point[], x: number, y: number, eps = 1e-6): boolean {
  return pts.some((p) => Math.abs(p.x - x) < eps && Math.abs(p.y - y) < eps);
}

describe("flattenPath", () => {
  it("flattens a closed triangle (M L L Z)", () => {
    const sp = flattenPath("M0 0 L10 0 L10 10 Z");
    expect(sp.length).toBe(1);
    const pts = sp[0]!;
    expect(has(pts, 0, 0)).toBe(true);
    expect(has(pts, 10, 0)).toBe(true);
    expect(has(pts, 10, 10)).toBe(true);
    // Z appends the start point so the loop closes back at (0,0).
    expect(pts[pts.length - 1]).toEqual({ x: 0, y: 0 });
  });

  it("flattens a cubic that bulges off the chord", () => {
    const sp = flattenPath("M0 0 C0 10 10 10 10 0");
    expect(sp.length).toBe(1);
    const pts = sp[0]!;
    expect(pts[0]!.x).toBeCloseTo(0, 6);
    expect(pts[0]!.y).toBeCloseTo(0, 6);
    const last = pts[pts.length - 1]!;
    expect(last.x).toBeCloseTo(10, 6);
    expect(last.y).toBeCloseTo(0, 6);
    // an interior sample is clearly pulled upward by the control points
    const interior = pts.slice(1, -1);
    expect(interior.some((p) => p.y > 1)).toBe(true);
  });

  it("treats relative commands the same as their absolute form", () => {
    const relPts = flattenPath("m0 0 l10 0 l0 10")[0]!;
    const absPts = flattenPath("M0 0 L10 0 L10 10")[0]!;
    expect(relPts).toEqual(absPts);
  });

  it("produces one subpath per M command", () => {
    const sp = flattenPath("M0 0 L5 5 M20 20 L25 25");
    expect(sp.length).toBe(2);
  });

  it("flattens an elliptical arc that bulges off the chord", () => {
    const pts = flattenPath("M0 0 A5 5 0 0 1 10 0")[0]!;
    expect(pts[0]!.x).toBeCloseTo(0, 6);
    expect(pts[0]!.y).toBeCloseTo(0, 6);
    const last = pts[pts.length - 1]!;
    expect(last.x).toBeCloseTo(10, 6);
    expect(last.y).toBeCloseTo(0, 6);
    const mid = pts[Math.floor(pts.length / 2)]!;
    expect(Math.abs(mid.y)).toBeGreaterThan(1);
  });

  it("returns [] for empty / whitespace / garbage input", () => {
    expect(flattenPath("")).toEqual([]);
    expect(flattenPath("   ")).toEqual([]);
    expect(flattenPath("garbage")).toEqual([]);
  });

  it("tokenizes implicit number boundaries (M10-5.5.3)", () => {
    const pts = flattenPath("M10-5.5.3 L1 2")[0]!;
    // M consumes (10, -5.5); the trailing 0.3 + L1 are an implicit lineto chain.
    expect(pts[0]).toEqual({ x: 10, y: -5.5 });
  });

  it("uses the reflected control point for smooth curves (S)", () => {
    // S with no preceding cubic reflects onto the current point (acts like its own
    // first control), so the result is deterministic and stable.
    const a = flattenPath("M0 0 C0 10 10 10 10 0 S20 -10 20 0");
    const b = flattenPath("M0 0 C0 10 10 10 10 0 S20 -10 20 0");
    expect(a).toEqual(b);
    expect(a[0]!.length).toBeGreaterThan(2);
  });

  it("is deterministic for a multi-command path", () => {
    const d = "M0 0 C0 10 10 10 10 0 S20 -10 20 0 Q25 5 30 0 T40 0 A5 5 0 1 1 50 0 H60 V70 Z";
    expect(flattenPath(d)).toEqual(flattenPath(d));
  });

  it("honors a custom samplesPerCurve", () => {
    const coarse = flattenPath("M0 0 C0 10 10 10 10 0", { samplesPerCurve: 4 })[0]!;
    const fine = flattenPath("M0 0 C0 10 10 10 10 0", { samplesPerCurve: 32 })[0]!;
    expect(coarse.length).toBe(1 + 4); // start + 4 samples
    expect(fine.length).toBe(1 + 32);
  });
});

const allFinite = (pts: Point[]): boolean => pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

describe("flattenPath — edge cases (regression)", () => {
  it("parses packed arc flags (SVGO style 'a5 5 0 11 10 0')", () => {
    // large=1, sweep=1 packed as "11" must equal the spaced form, not drop the arc.
    const packed = flattenPath("M0 0 A5 5 0 11 10 0")[0]!;
    const spaced = flattenPath("M0 0 A5 5 0 1 1 10 0")[0]!;
    expect(packed).toEqual(spaced);
    expect(packed.length).toBe(1 + 16); // not the dropped-arc single point
    expect(packed[packed.length - 1]!.x).toBeCloseTo(10, 6);
  });

  it("omits a zero-length arc instead of emitting NaN", () => {
    const sp = flattenPath("M10 10 A5 5 0 1 0 10 10 L60 60");
    const pts = sp[0]!;
    expect(allFinite(pts)).toBe(true); // no NaN from the degenerate arc
    expect(pts[pts.length - 1]).toEqual({ x: 60, y: 60 }); // the following line still draws
  });

  it("never produces non-finite points for a single-arc 'full circle'", () => {
    const pts = flattenPath("M50 50 A25 25 0 1 1 50 50")[0]!;
    expect(allFinite(pts)).toBe(true);
  });

  it("starts a fresh subpath when a draw command follows Z (no intervening M)", () => {
    const sp = flattenPath("M0 0 L10 0 Z L20 0");
    expect(sp.length).toBe(2); // closed loop, then a new subpath
    expect(sp[1]![0]).toEqual({ x: 0, y: 0 }); // new subpath begins at the prior start point
    expect(has(sp[1]!, 20, 0)).toBe(true);
  });
});
