import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildMorph } from "../../src/math/morph.js";
import { morphIn } from "../../src/math/presets.js";

const CIRCLE = "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z";
const STAR = "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z";

function scene(nodes: Node[], w = 140, h = 140): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}
function inkPixels(spec: SceneSpec): number {
  const f = renderFrame(spec, 0);
  let n = 0;
  for (let i = 0; i < f.pixels.length; i += 4) if (f.pixels[i]! < 240 || f.pixels[i + 1]! < 240 || f.pixels[i + 2]! < 240) n++;
  return n;
}

describe("buildMorph", () => {
  it("produces a valid polyline with matched source/target point counts", () => {
    const m = buildMorph({ from: CIRCLE, to: STAR, samples: 48, fill: "red" });
    expect(m.type).toBe("polyline");
    expect(m.points.length).toBe(48);
    expect(m.morphTo!.length).toBe(48);
    expect(m.morph).toBe(0);
    expect(validateScene(scene([m])).valid).toBe(true);
  });

  it("renders at both ends of the morph", () => {
    const base = buildMorph({ from: CIRCLE, to: STAR, x: 20, y: 20, samples: 64, fill: "red" });
    expect(() => renderFrame(scene([{ ...base, morph: 0 } as Node]), 0).toPNG()).not.toThrow();
    expect(() => renderFrame(scene([{ ...base, morph: 1 } as Node]), 0).toPNG()).not.toThrow();
  });

  it("survives degenerate path input", () => {
    const m = buildMorph({ from: "", to: "garbage", samples: 16 });
    expect(validateScene(scene([m])).valid).toBe(true);
  });
});

describe("buildMorph subpath selection", () => {
  it("morphs the geometrically-largest outline, not the most-detailed one", () => {
    // A big square drawn with 4 straight lines (5 points) + a tiny curve-heavy circle (~65 points).
    // Point-count selection would wrongly pick the tiny circle; area selection picks the square.
    const bigSquare = "M0 0 L300 0 L300 300 L0 300 Z";
    const tinyCircle = "M150 150 C151 150 152 151 152 152 C152 153 151 154 150 154 C149 154 148 153 148 152 C148 151 149 150 150 150 Z";
    const m = buildMorph({ from: `${bigSquare} ${tinyCircle}`, to: "M0 0 L10 0 L10 10 Z", samples: 16 });
    const xs = m.points.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100); // the 300-wide square, not the 4px circle
  });
});

describe("morphIn preset", () => {
  it("animates the morph property 0 → 1", () => {
    const t = morphIn({ start: 0, duration: 1 })[0]!;
    expect(t.property).toBe("morph");
    expect(t.keyframes[0]!.value).toBe(0);
    expect(t.keyframes[t.keyframes.length - 1]!.value).toBe(1);
  });
});

describe("path draw-on", () => {
  it("inks less at low progress than fully drawn", () => {
    const at = (progress: number): SceneSpec =>
      scene([{ id: "p", type: "path", x: 20, y: 20, d: STAR, stroke: "#000000", strokeWidth: 4, progress }]);
    expect(inkPixels(at(0.3))).toBeLessThan(inkPixels(at(1)));
    expect(inkPixels(at(0.3))).toBeGreaterThan(0);
  });
});
