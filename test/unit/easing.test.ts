import { describe, it, expect } from "vitest";
import { applyEasing, cubicBezier, resolveEasing, EASING_NAMES } from "../../src/index.js";
import type { EasingName } from "../../src/index.js";

describe("easing", () => {
  it("every named easing pins the endpoints (0->0, 1->1)", () => {
    expect(EASING_NAMES.length).toBeGreaterThanOrEqual(26); // the full library, not a hand-maintained subset
    for (const name of EASING_NAMES) {
      expect(applyEasing(name as EasingName, 0)).toBeCloseTo(0, 6);
      expect(applyEasing(name as EasingName, 1)).toBeCloseTo(1, 6);
    }
  });

  it("linear is the identity", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(applyEasing("linear", t)).toBeCloseTo(t, 9);
    }
  });

  it("easeInQuad and easeOutQuad are reflections", () => {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(applyEasing("easeInQuad", t)).toBeCloseTo(1 - applyEasing("easeOutQuad", 1 - t), 6);
    }
  });

  it("back easing overshoots beyond [0,1] (anticipation/overshoot)", () => {
    // easeOutBack exceeds 1 somewhere in the interior.
    const samples = Array.from({ length: 99 }, (_, i) => applyEasing("easeOutBack", (i + 1) / 100));
    expect(Math.max(...samples)).toBeGreaterThan(1);
    // easeInBack dips below 0 early.
    const inSamples = Array.from({ length: 50 }, (_, i) => applyEasing("easeInBack", (i + 1) / 100));
    expect(Math.min(...inSamples)).toBeLessThan(0);
  });

  it("unknown easing name falls back to linear", () => {
    expect(applyEasing("notReal" as EasingName, 0.4)).toBeCloseTo(0.4, 9);
  });

  it("easeOutBounce has the expected bounce structure in its interior", () => {
    const samples = Array.from({ length: 101 }, (_, i) => applyEasing("easeOutBounce", i / 100));
    expect(Math.max(...samples)).toBeLessThanOrEqual(1 + 1e-9);
    // The defining feature: it is NON-monotonic — it actually dips (bounces) at least once. A plain
    // monotonic ease would pass the value checks below but never dip.
    const dips = samples.some((v, i) => i > 0 && v < samples[i - 1]! - 1e-9);
    expect(dips).toBe(true);
    expect(applyEasing("easeOutBounce", 0.95)).toBeGreaterThan(0.95);
  });

  it("the springs overshoot 1 and settle back to it", () => {
    for (const name of ["easeOutSpring", "easeOutSpringy"] as const) {
      const interior = Array.from({ length: 99 }, (_, i) => applyEasing(name, (i + 1) / 100));
      expect(Math.max(...interior)).toBeGreaterThan(1); // springy overshoot
      expect(applyEasing(name, 1)).toBeCloseTo(1, 6); // settles exactly at rest
    }
  });

  it("easeOutElastic oscillates around 1 before settling", () => {
    const interior = Array.from({ length: 99 }, (_, i) => applyEasing("easeOutElastic", (i + 1) / 100));
    expect(Math.max(...interior)).toBeGreaterThan(1); // overshoots
    expect(Math.min(...interior)).toBeLessThan(1); // and dips back
  });

  it("easeInOutCubic is symmetric about its midpoint", () => {
    for (const t of [0.1, 0.25, 0.4]) {
      expect(applyEasing("easeInOutCubic", t)).toBeCloseTo(1 - applyEasing("easeInOutCubic", 1 - t), 6);
    }
    expect(applyEasing("easeInOutCubic", 0.5)).toBeCloseTo(0.5, 6);
  });

  describe("cubicBezier", () => {
    it("a linear bezier equals identity", () => {
      for (const t of [0, 0.2, 0.5, 0.8, 1]) {
        expect(cubicBezier(0, 0, 1, 1, t)).toBeCloseTo(t, 4);
      }
    });

    it("ease (0.25,0.1,0.25,1) pins endpoints and is monotonic", () => {
      expect(cubicBezier(0.25, 0.1, 0.25, 1, 0)).toBe(0);
      expect(cubicBezier(0.25, 0.1, 0.25, 1, 1)).toBe(1);
      let prev = -1;
      for (let i = 0; i <= 20; i++) {
        const v = cubicBezier(0.25, 0.1, 0.25, 1, i / 20);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    });

    it("is resolvable via resolveEasing with an array spec", () => {
      const fn = resolveEasing([0.42, 0, 0.58, 1]);
      expect(fn(0)).toBeCloseTo(0, 6);
      expect(fn(1)).toBeCloseTo(1, 6);
      expect(fn(0.5)).toBeCloseTo(0.5, 2); // symmetric ease-in-out
    });
  });
});
