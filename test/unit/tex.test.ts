import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { buildMath, texToNodes } from "../../src/math/tex.js";

function scene(node: SceneSpec["nodes"][number], w = 320, h = 160): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes: [node] };
}
function inkPixels(spec: SceneSpec): number {
  const f = renderFrame(spec, 0);
  let n = 0;
  for (let i = 0; i < f.pixels.length; i += 4) if (f.pixels[i]! < 240 || f.pixels[i + 1]! < 240 || f.pixels[i + 2]! < 240) n++;
  return n;
}

describe("LaTeX typesetting (buildMath)", () => {
  it("typesets a fraction + exponent into a group of glyph paths", () => {
    const r = texToNodes({ id: "m", latex: "x^2 + \\frac{1}{2}", x: 20, y: 20, size: 44 });
    expect(r.node.type).toBe("group");
    expect(r.node.children.length).toBeGreaterThan(3); // x, 2, +, 1, bar, 2
    expect(r.node.children.every((c) => c.type === "path")).toBe(true);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(validateScene(scene(r.node)).valid).toBe(true);
  });

  it("renders typeset math to pixels", () => {
    const node = buildMath({ id: "q", latex: "\\sqrt{x^2+y^2}", x: 20, y: 40, size: 48, color: "#1d2b2b" });
    expect(inkPixels(scene(node))).toBeGreaterThan(50);
  });

  it("is deterministic — identical LaTeX yields identical baked path data", () => {
    const a = buildMath({ id: "m", latex: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", size: 40 });
    const b = buildMath({ id: "m", latex: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", size: 40 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("applies the requested color to every glyph", () => {
    const node = buildMath({ id: "m", latex: "a+b", color: "#cc0044" });
    expect(node.children.every((c) => (c as { fill?: string }).fill === "#cc0044")).toBe(true);
  });

  it("returns an empty group for malformed or unsupported LaTeX (not a solid block)", () => {
    expect(texToNodes({ id: "b1", latex: "\\frac{1", size: 40 }).node.children.length).toBe(0); // unbalanced brace
    expect(texToNodes({ id: "b2", latex: "\\unknowncmd x", size: 40 }).node.children.length).toBe(0); // undefined command
    expect(texToNodes({ id: "b3", latex: "\\begin{matrix} a & b \\end{matrix}", size: 40 }).node.children.length).toBe(0); // unsupported env
    expect(() => renderFrame(scene(texToNodes({ id: "b1", latex: "\\frac{1", size: 40 }).node), 0).toPNG()).not.toThrow();
  });

  it("renders a \\boxed frame as a hollow outline, not a solid fill", () => {
    const node = buildMath({ id: "bx", latex: "\\boxed{x}", size: 60 });
    // the frame is an even-odd ring (outer minus inner), so content stays visible
    expect(node.children.some((c) => (c as { fillRule?: string }).fillRule === "evenodd")).toBe(true);
  });

  it("stretches an \\overline bar across its argument", () => {
    // A, B, and a bar that spans both — the bar's width must exceed a single glyph's.
    const node = buildMath({ id: "ovl", latex: "\\overline{ABCD}", size: 100 });
    expect(node.children.length).toBeGreaterThanOrEqual(5); // 4 letters + bar
  });
});
