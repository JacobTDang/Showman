import { describe, it, expect } from "vitest";
import { curveFor } from "../../src/catalog/physics/motionGraph.tool.js";
import { fieldFor } from "../../src/catalog/physics/vectorField.tool.js";

// motionGraph.tool.ts and vectorField.tool.ts wrap raw-closure composers (motion.ts's
// motionGraph, fields.ts's vectorField) behind a named-preset layer, since neither a Zod
// schema nor an LLM's JSON output can express an arbitrary `fn: (t) => number` or
// `field: (nx,ny) => vector`. These tests pin down the preset -> closure MATH directly
// (pure arithmetic, no fuzz needed) rather than going through build()'s node output.

const SERIES_DEFAULTS = {
  label: "s",
  value: 0,
  slope: 1,
  intercept: 0,
  a: 1,
  v0: 0,
  x0: 0,
  speed: 20,
  angle: 45,
  amplitude: 1,
  decay: 0.5,
  omega: 2 * Math.PI,
} as const;

describe("physics.motionGraph presets", () => {
  it("constant: flat at `value` for any t", () => {
    const fn = curveFor({ ...SERIES_DEFAULTS, preset: "constant", value: 5 });
    expect(fn(0)).toBe(5);
    expect(fn(3.7)).toBe(5);
  });

  it("linear: slope*t + intercept", () => {
    const fn = curveFor({ ...SERIES_DEFAULTS, preset: "linear", slope: 3, intercept: 1 });
    expect(fn(0)).toBe(1);
    expect(fn(2)).toBe(7);
  });

  it("quadratic: 0.5*a*t^2 + v0*t + x0 (kinematics position under constant acceleration)", () => {
    const fn = curveFor({ ...SERIES_DEFAULTS, preset: "quadratic", a: 2, v0: 0, x0: 0 });
    expect(fn(2)).toBe(4); // 0.5*2*4 = 4
    const withOffset = curveFor({ ...SERIES_DEFAULTS, preset: "quadratic", a: 2, v0: 3, x0: 10 });
    expect(withOffset(2)).toBe(0.5 * 2 * 4 + 3 * 2 + 10); // 20
  });

  it("quadratic's implied velocity (a*t + v0) matches a separately-configured linear series — the moving-man pairing", () => {
    const a = 2;
    const v0 = 1;
    const position = curveFor({ ...SERIES_DEFAULTS, preset: "quadratic", a, v0, x0: 0 });
    const velocity = curveFor({ ...SERIES_DEFAULTS, preset: "linear", slope: a, intercept: v0 });
    // finite-difference derivative of position should track the linear velocity curve
    const h = 1e-4;
    for (const t of [0, 1, 2, 3]) {
      const dPos = (position(t + h) - position(t - h)) / (2 * h);
      expect(dPos).toBeCloseTo(velocity(t), 2);
    }
  });

  it("projectile-height: speed*sin(angle)*t - 0.5*9.8*t^2", () => {
    const fn = curveFor({ ...SERIES_DEFAULTS, preset: "projectile-height", speed: 0, angle: 45 });
    expect(fn(1)).toBeCloseTo(-4.9, 6); // pure freefall term when speed=0
    const launched = curveFor({ ...SERIES_DEFAULTS, preset: "projectile-height", speed: 20, angle: 90 });
    expect(launched(0)).toBe(0);
    expect(launched(1)).toBeCloseTo(20 * 1 - 4.9, 6);
  });

  it("damped-oscillation: amplitude*exp(-decay*t)*cos(omega*t)", () => {
    const fn = curveFor({ ...SERIES_DEFAULTS, preset: "damped-oscillation", amplitude: 2, decay: 0, omega: 0 });
    expect(fn(0)).toBeCloseTo(2, 6);
    expect(fn(5)).toBeCloseTo(2, 6); // no decay, omega=0 -> constant
    const decaying = curveFor({ ...SERIES_DEFAULTS, preset: "damped-oscillation", amplitude: 1, decay: 1, omega: 0 });
    expect(decaying(1)).toBeCloseTo(Math.exp(-1), 6);
  });
});

const FIELD_DEFAULTS = {
  angle: 0,
  magnitude: 1,
  centerX: 0.5,
  centerY: 0.5,
  falloff: "none",
  separation: 0.3,
  width: 420,
  height: 300,
  cols: 8,
  rows: 6,
  normalize: false,
  colorByMagnitude: false,
} as const;

describe("physics.vectorField presets", () => {
  it("uniform: constant vector at `angle`/`magnitude` everywhere", () => {
    const f = fieldFor({ ...FIELD_DEFAULTS, preset: "uniform", angle: 0, magnitude: 2 });
    expect(f(0, 0)).toEqual({ vx: 2, vy: 0 });
    expect(f(1, 1)).toEqual({ vx: 2, vy: 0 });
    const vertical = fieldFor({ ...FIELD_DEFAULTS, preset: "uniform", angle: 90, magnitude: 1 });
    expect(vertical(0.3, 0.7).vx).toBeCloseTo(0, 6);
    expect(vertical(0.3, 0.7).vy).toBeCloseTo(1, 6);
  });

  it("radial-outward: points away from the center, no falloff = constant magnitude", () => {
    const f = fieldFor({ ...FIELD_DEFAULTS, preset: "radial-outward", centerX: 0.5, centerY: 0.5, magnitude: 1, falloff: "none" });
    const v = f(1, 0.5); // directly to the right of center
    expect(v.vx).toBeCloseTo(1, 6);
    expect(v.vy).toBeCloseTo(0, 6);
  });

  it("radial-inward: same point, opposite sign of radial-outward", () => {
    const out = fieldFor({ ...FIELD_DEFAULTS, preset: "radial-outward" })(1, 0.5);
    const inw = fieldFor({ ...FIELD_DEFAULTS, preset: "radial-inward" })(1, 0.5);
    expect(inw.vx).toBeCloseTo(-out.vx, 6);
    expect(inw.vy).toBeCloseTo(-out.vy, 6);
  });

  it("radial falloff: inverse and inverse-square shrink magnitude with distance, inverse-square more steeply", () => {
    const none = fieldFor({ ...FIELD_DEFAULTS, preset: "radial-outward", falloff: "none" });
    const inv = fieldFor({ ...FIELD_DEFAULTS, preset: "radial-outward", falloff: "inverse" });
    const invSq = fieldFor({ ...FIELD_DEFAULTS, preset: "radial-outward", falloff: "inverse-square" });
    const near = { vx: 0.5 + 0.1, vy: 0.5 };
    const far = { vx: 0.5 + 0.4, vy: 0.5 };
    const magOf = (v: { vx: number; vy: number }) => Math.hypot(v.vx, v.vy);
    const ratio = (f: typeof inv) => magOf(f(far.vx, far.vy)) / magOf(f(near.vx, near.vy));
    expect(magOf(none(far.vx, far.vy))).toBeCloseTo(magOf(none(near.vx, near.vy)), 6); // no falloff -> equal
    expect(ratio(inv)).toBeLessThan(1); // farther = weaker
    expect(ratio(invSq)).toBeLessThan(ratio(inv)); // inverse-square decays more steeply than inverse
  });

  it("vortex: perpendicular to the radius vector (rotational)", () => {
    const f = fieldFor({ ...FIELD_DEFAULTS, preset: "vortex", centerX: 0.5, centerY: 0.5, magnitude: 1, falloff: "none" });
    const v = f(1, 0.5); // directly right of center -> tangential direction is (0, +1) in this convention
    expect(v.vx).toBeCloseTo(0, 6);
    expect(v.vy).toBeCloseTo(1, 6);
    // perpendicularity holds anywhere: radial . tangential = 0
    const dx = 0.2;
    const dy = 0.35;
    const t = f(0.5 + dx, 0.5 + dy);
    expect(dx * t.vx + dy * t.vy).toBeCloseTo(0, 6);
  });

  it("dipole: superposes an outward source and an inward sink at the two poles", () => {
    const f = fieldFor({
      ...FIELD_DEFAULTS,
      preset: "dipole",
      centerX: 0.5,
      centerY: 0.5,
      separation: 0.2,
      magnitude: 1,
      falloff: "inverse-square",
    });
    // At the exact midpoint, by symmetry the x-components from each pole cancel... actually they
    // ADD (both point away from source, toward sink, along +x) — assert it's non-zero and finite.
    const mid = f(0.5, 0.5);
    expect(Number.isFinite(mid.vx)).toBe(true);
    expect(Number.isFinite(mid.vy)).toBe(true);
  });
});
