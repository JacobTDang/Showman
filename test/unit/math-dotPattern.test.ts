import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildDotPattern } from "../../src/math/dotPattern.js";
import { samplePixel } from "../helpers.js";

function scene(nodes: Node[], w = 200, h = 200): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

describe("dot pattern (subitizing)", () => {
  it("builds exactly n dot ellipses (n = 5)", () => {
    const g = buildDotPattern({ id: "d", n: 5, x: 0, y: 0, size: 120 });
    const ellipses = g.children.filter((c) => c.type === "ellipse");
    expect(ellipses.length).toBe(5);
    expect(g.children.length).toBe(5); // only the dots, nothing else
  });

  it("produces a valid scene", () => {
    const g = buildDotPattern({ n: 5, x: 20, y: 20, size: 120 });
    expect(validateScene(scene([g])).valid).toBe(true);
  });

  it("a center dot pixel is the dot color", () => {
    const size = 120;
    const g = buildDotPattern({ id: "dp", n: 5, x: 0, y: 0, size, color: "red" });
    const spec = scene([g], size, size);
    expect(validateScene(spec).valid).toBe(true);
    // depth: each dot is a sphere — a radial chip gradient that fades to the exact base color.
    const dot = g.children[2] as { gradient?: { stops: { color: string }[] } }; // the dead-center dot (n=5)
    expect(dot.gradient?.stops.at(-1)?.color).toBe("red");
    const f = renderFrame(spec, 0);
    // n = 5 has a dot dead-center of the box; the chip lightens the center but the hue stays red.
    const p = samplePixel(f, size / 2, size / 2);
    expect(p.r).toBeGreaterThan(150);
    expect(p.g).toBeLessThan(140); // not white / not another hue
    expect(p.b).toBeLessThan(140);
  });

  it("defaults dots to theme.palette.primary (and adds a depth chip by default)", () => {
    const g = buildDotPattern({ n: 6 });
    const first = g.children[0] as { type: string; fill?: string; gradient?: { stops: { color: string }[] } };
    expect(first.type).toBe("ellipse");
    expect(first.fill).toBe("#ef6c35"); // sunshine primary (the flat fallback color)
    expect(first.gradient?.stops.at(-1)?.color).toBe("#ef6c35"); // chip fades to that exact primary
  });

  it("emits flat fills (no gradient) when depth is flat", () => {
    const g = buildDotPattern({ n: 5, color: "red", depth: "flat" });
    expect((g.children[0] as { gradient?: unknown }).gradient).toBeUndefined();
  });

  it("uses a 2-row grid for 7..10", () => {
    const g = buildDotPattern({ n: 10, size: 100 });
    const rows = new Set(g.children.map((c) => Math.round((c as { y?: number }).y ?? 0)));
    expect(rows.size).toBe(2); // exactly two rows
    expect(g.children.length).toBe(10);
  });
});
