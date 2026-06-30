import { describe, it, expect } from "vitest";
import {
  fillRamp,
  chipRamp,
  elevation,
  softShadow,
  glowNode,
  surfaceFill,
  renderFrame,
  validateScene,
  SPEC_VERSION,
} from "../../src/index.js";
import type { SceneSpec, Node, LinearGradient, RadialGradient } from "../../src/index.js";

const scene = (nodes: Node[]): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 200,
  height: 120,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes,
});

describe("depth: fillRamp", () => {
  it("ramps lighter-top → base over [0,h] and is golden-safe (a gradient, no blur)", () => {
    const g = fillRamp("#2563eb", 80) as LinearGradient;
    expect(g.type).toBe("linear");
    expect(g.from).toEqual({ x: 0, y: 0 });
    expect(g.to).toEqual({ x: 0, y: 80 });
    expect(g.stops).toHaveLength(2);
    expect(g.stops[0]!.offset).toBe(0);
    expect(g.stops[1]!.offset).toBe(1);
    expect(g.stops[1]!.color).toBe("#2563eb"); // bottom is the exact base color
    expect(g.stops[0]!.color).not.toBe("#2563eb"); // top is lightened
  });
  it("returns undefined for flat depth and for non-positive height (caller keeps a solid fill)", () => {
    expect(fillRamp("#2563eb", 80, "flat")).toBeUndefined();
    expect(fillRamp("#2563eb", 0)).toBeUndefined();
    expect(fillRamp("#2563eb", -5)).toBeUndefined();
  });
  it("rich lifts the top stop more than soft", () => {
    const soft = (fillRamp("#2563eb", 50, "soft") as LinearGradient).stops[0]!.color;
    const rich = (fillRamp("#2563eb", 50, "rich") as LinearGradient).stops[0]!.color;
    expect(soft).not.toBe(rich);
  });
});

describe("depth: chipRamp", () => {
  it("is a radial highlight centered in the [0,2r] box with an up-left hotspot", () => {
    const g = chipRamp("#ef476f", 20) as RadialGradient;
    expect(g.type).toBe("radial");
    expect(g.center).toEqual({ x: 20, y: 20 });
    expect(g.innerCenter!.x).toBeLessThan(20); // hotspot left of center
    expect(g.innerCenter!.y).toBeLessThan(20); // …and above center
    expect(g.stops[g.stops.length - 1]!.color).toBe("#ef476f"); // fades out to the base
  });
  it("returns undefined for flat / non-positive radius", () => {
    expect(chipRamp("#ef476f", 20, "flat")).toBeUndefined();
    expect(chipRamp("#ef476f", 0)).toBeUndefined();
  });
});

describe("depth: shadows", () => {
  it("elevation is a CRISP (blur:0) offset shadow — golden-safe", () => {
    const s = elevation()!;
    expect(s.blur).toBe(0); // never a ctx-blur in the default look
    expect(s.offsetY).toBeGreaterThan(0);
    expect(elevation("flat")).toBeUndefined();
    expect(elevation("rich")!.offsetY!).toBeGreaterThan(elevation("soft")!.offsetY!);
  });
  it("softShadow (blur>0) only exists in rich mode (kept out of golden scenes)", () => {
    expect(softShadow("soft")).toBeUndefined();
    expect(softShadow("flat")).toBeUndefined();
    expect(softShadow("rich")!.blur).toBeGreaterThan(0);
  });
});

describe("depth: glowNode", () => {
  it("is a radial-gradient ellipse halo (NOT a shadowBlur) that fades to transparent", () => {
    const n = glowNode("g", 100, 60, 18, "#ffd166") as Node & { gradient?: RadialGradient; shadow?: unknown };
    expect(n.type).toBe("ellipse");
    expect(n.shadow).toBeUndefined(); // safe: no blur shadow
    const stops = (n.gradient as RadialGradient).stops;
    expect(stops[0]!.offset).toBe(0);
    expect(stops[stops.length - 1]!.offset).toBe(1);
    expect(stops[stops.length - 1]!.color).toMatch(/00$/); // outer edge fully transparent (#rrggbb00)
  });
  it("returns undefined for flat / non-positive radius", () => {
    expect(glowNode("g", 0, 0, 18, "#ffd166", "flat")).toBeUndefined();
    expect(glowNode("g", 0, 0, 0, "#ffd166")).toBeUndefined();
  });
});

describe("depth: surfaceFill", () => {
  it("returns a gentle gradient for soft/rich and the bare color for flat", () => {
    expect(surfaceFill("#fff8e7", 120, "flat")).toBe("#fff8e7");
    const g = surfaceFill("#fff8e7", 120) as LinearGradient;
    expect(g.type).toBe("linear");
    expect(g.stops[1]!.color).toBe("#fff8e7");
  });
});

describe("depth: renders deterministically", () => {
  it("a depth-styled rect + glow validates and is byte-identical render-twice", () => {
    const nodes: Node[] = [
      glowNode("halo", 100, 60, 24, "#ffb703")!,
      { id: "card", type: "rect", x: 60, y: 30, width: 80, height: 60, radius: 12, gradient: fillRamp("#ef6c35", 60), shadow: elevation() },
    ];
    expect(validateScene(scene(nodes))).toMatchObject({ valid: true });
    const s = scene(nodes);
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 0).pixels))).toBe(true);
  });
});
