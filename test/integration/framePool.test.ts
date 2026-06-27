import { describe, it, expect } from "vitest";
import { renderFramesParallel, renderFramesSequential } from "../../src/render/framePool.js";
import { renderFrame } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { pixelsEqual } from "../helpers.js";

function scene(): SceneSpec {
  return {
    specVersion: 1,
    width: 120,
    height: 80,
    fps: 10,
    duration: 1.2, // 12 frames
    background: "#fdf6e3",
    seed: 3,
    nodes: [
      {
        id: "ball",
        type: "ellipse",
        x: 10,
        y: 30,
        width: 20,
        height: 20,
        fill: "#e63946",
        tracks: [
          {
            property: "x",
            keyframes: [
              { t: 0, value: 10 },
              { t: 1.2, value: 90, easing: "easeOutBack" },
            ],
          },
        ],
      },
    ],
  };
}

describe("frame pool (M1.1)", () => {
  const indices = Array.from({ length: 12 }, (_, i) => i);

  it("parallel rendering returns frames in index order, byte-identical to sequential", async () => {
    const spec = scene();
    const seq = renderFramesSequential(spec, indices);
    const par = await renderFramesParallel(spec, indices, { concurrency: 4 });

    expect(par.map((f) => f.index)).toEqual(indices); // ordered
    expect(par.length).toBe(seq.length);
    for (let i = 0; i < seq.length; i++) {
      expect(par[i]!.index).toBe(seq[i]!.index);
      expect(pixelsEqual(par[i]!.pixels, seq[i]!.pixels)).toBe(true); // determinism across threads
    }
  });

  it("matches single-call renderFrame for each frame", async () => {
    const spec = scene();
    const par = await renderFramesParallel(spec, indices, { concurrency: 4 });
    for (const f of par) {
      expect(pixelsEqual(f.pixels, renderFrame(spec, f.index).pixels)).toBe(true);
    }
  });

  it("sequential fallback produces the same frames", async () => {
    const spec = scene();
    const forced = await renderFramesParallel(spec, indices, { sequential: true });
    const seq = renderFramesSequential(spec, indices);
    for (let i = 0; i < seq.length; i++) {
      expect(pixelsEqual(forced[i]!.pixels, seq[i]!.pixels)).toBe(true);
    }
  });
});
