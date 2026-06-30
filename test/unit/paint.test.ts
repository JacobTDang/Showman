import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION } from "../../src/index.js";
import type { SceneSpec, Node } from "../../src/index.js";
import { samplePixel, pixelAt, pixelsEqual } from "../helpers.js";

function scene(nodes: Node[], background: SceneSpec["background"] = "#ffffff", w = 160, h = 120): SceneSpec {
  return { specVersion: SPEC_VERSION, width: w, height: h, fps: 1, duration: 1, seed: 5, background, nodes };
}

describe("gradient fills", () => {
  it("renders a left→right linear gradient across a shape", () => {
    const s = scene([
      {
        id: "g",
        type: "rect",
        x: 10,
        y: 10,
        width: 120,
        height: 80,
        gradient: {
          type: "linear",
          from: { x: 0, y: 0 },
          to: { x: 120, y: 0 },
          stops: [
            { offset: 0, color: "#ff0000" },
            { offset: 1, color: "#0000ff" },
          ],
        },
      },
    ]);
    expect(validateScene(s).valid).toBe(true);
    const r = renderFrame(s, 0);
    const left = samplePixel(r, 18, 50);
    const right = samplePixel(r, 122, 50);
    expect(left.r).toBeGreaterThan(right.r); // red fades out left→right
    expect(right.b).toBeGreaterThan(left.b); // blue rises left→right
    // pin the actual stop colors, not just the ordering: clearly red on the left, blue on the right
    expect(left.r).toBeGreaterThan(150);
    expect(left.b).toBeLessThan(100);
    expect(right.b).toBeGreaterThan(150);
    expect(right.r).toBeLessThan(100);
  });

  it("a gradient paints even when fill is transparent", () => {
    const r = renderFrame(
      scene([
        {
          id: "g",
          type: "rect",
          x: 10,
          y: 10,
          width: 100,
          height: 80,
          fill: "transparent",
          gradient: {
            type: "radial",
            center: { x: 50, y: 40 },
            radius: 50,
            stops: [
              { offset: 0, color: "#22dd22" },
              { offset: 1, color: "#003300" },
            ],
          },
        },
      ]),
      0,
    );
    const center = samplePixel(r, 60, 50);
    expect(center.g).toBeGreaterThan(180); // near the #22dd22 center stop (g=221), not the white bg
    expect(center.r).toBeLessThan(120); // and clearly green, not white/grey
    expect(center.b).toBeLessThan(120);
  });
});

describe("shadows", () => {
  it("casts a hard offset shadow outside the shape", () => {
    const r = renderFrame(
      scene([
        {
          id: "s",
          type: "rect",
          x: 40,
          y: 30,
          width: 50,
          height: 40,
          fill: "#ffffff",
          shadow: { color: "#000000", blur: 0, offsetX: 12, offsetY: 12 },
        },
      ]),
      0,
    );
    // just past the bottom-right corner: shadow ink, where there'd otherwise be white bg
    expect(samplePixel(r, 98, 78).r).toBeLessThan(120);
  });
});

describe("dashed strokes", () => {
  it("produces gaps along the line (vs a solid stroke)", () => {
    const line = (dash?: number[]): Node => ({
      id: "l",
      type: "polyline",
      x: 10,
      y: 60,
      points: [
        { x: 0, y: 0 },
        { x: 140, y: 0 },
      ],
      stroke: "#000000",
      strokeWidth: 4,
      ...(dash ? { dash } : {}),
    });
    const solid = renderFrame(scene([line()]), 0);
    const dashed = renderFrame(scene([line([8, 8])]), 0);
    const inked = (r: ReturnType<typeof renderFrame>): number => {
      let n = 0;
      for (let x = 12; x < 148; x++) if (samplePixel(r, x, 60).r < 128) n++;
      return n;
    };
    expect(inked(solid)).toBeGreaterThan(inked(dashed) + 20); // dashes leave gaps
    expect(inked(dashed)).toBeGreaterThan(10); // but still draws dashes
  });
});

describe("backdrop", () => {
  it("fills a gradient background (top differs from bottom)", () => {
    const s = scene([], {
      fill: {
        type: "linear",
        from: { x: 0, y: 0 },
        to: { x: 0, y: 120 },
        stops: [
          { offset: 0, color: "#000000" },
          { offset: 1, color: "#ffffff" },
        ],
      },
    });
    expect(validateScene(s).valid).toBe(true);
    const r = renderFrame(s, 0);
    expect(pixelAt(r.pixels, r.width, 80, 4).r).toBeLessThan(pixelAt(r.pixels, r.width, 80, 116).r);
  });
  it("darkens the edges with a vignette", () => {
    const r = renderFrame(scene([], { fill: "#888888", vignette: 0.7 }), 0);
    expect(pixelAt(r.pixels, r.width, 80, 60).r).toBeGreaterThan(pixelAt(r.pixels, r.width, 3, 3).r);
  });
  it("adds seeded grain: deterministic per frame, varies across frames", () => {
    const s = scene([], { fill: "#808080", grain: 0.4 });
    const a0 = renderFrame(s, 0);
    const b0 = renderFrame(s, 0);
    const a1 = renderFrame(s, 1);
    expect(pixelsEqual(a0.pixels, b0.pixels)).toBe(true); // same frame → identical
    expect(pixelsEqual(a0.pixels, a1.pixels)).toBe(false); // different frame → different grain
    // grain perturbs the flat fill: not every pixel is exactly 0x80
    let perturbed = false;
    for (let x = 0; x < 40 && !perturbed; x++) if (samplePixel(a0, x, 10).r !== 0x80) perturbed = true;
    expect(perturbed).toBe(true);
  });
});

describe("paint review fixes", () => {
  it("animates dashOffset (validates + the dashes actually move)", () => {
    const s: SceneSpec = {
      specVersion: SPEC_VERSION,
      width: 160,
      height: 60,
      fps: 10,
      duration: 1,
      seed: 1,
      background: "#ffffff",
      nodes: [
        {
          id: "l",
          type: "polyline",
          x: 10,
          y: 30,
          points: [
            { x: 0, y: 0 },
            { x: 140, y: 0 },
          ],
          stroke: "#000000",
          strokeWidth: 4,
          dash: [10, 10],
          tracks: [
            {
              property: "dashOffset",
              keyframes: [
                { t: 0, value: 0 },
                { t: 1, value: 20 },
              ],
            },
          ],
        },
      ],
    };
    expect(validateScene(s).valid).toBe(true); // no more bogus INVALID_COLOR
    expect(pixelsEqual(renderFrame(s, 0).pixels, renderFrame(s, 5).pixels)).toBe(false); // marching ants
  });

  it("renders a gradient on text (no longer silently ignored)", () => {
    const txt = (gradient?: object): Node =>
      ({
        id: "t",
        type: "text",
        x: 6,
        y: 8,
        text: "MMMMMMM",
        fontSize: 60,
        fill: "#000000",
        ...(gradient ? { gradient } : {}),
      }) as Node;
    const r = renderFrame(
      scene(
        [
          txt({
            type: "linear",
            from: { x: 0, y: 0 },
            to: { x: 200, y: 0 },
            stops: [
              { offset: 0, color: "#ff0000" },
              { offset: 1, color: "#0000ff" },
            ],
          }),
        ],
        "#ffffff",
        220,
        80,
      ),
      0,
    );
    const band = (x0: number, x1: number): { r: number; b: number } => {
      let rs = 0,
        bs = 0,
        c = 0;
      for (let y = 10; y < 70; y++)
        for (let x = x0; x < x1; x++) {
          const p = samplePixel(r, x, y);
          if (p.r + p.g + p.b < 600) {
            rs += p.r;
            bs += p.b;
            c++;
          }
        }
      return { r: rs / Math.max(1, c), b: bs / Math.max(1, c) };
    };
    const left = band(8, 70);
    const right = band(140, 210);
    expect(left.r).toBeGreaterThan(right.r); // ink is redder on the left
    expect(right.b).toBeGreaterThan(left.b); // and bluer on the right
  });

  it("a gradient-only path does not get a default black stroke", () => {
    const tri = (extra: object): Node => ({
      id: "p",
      type: "path",
      x: 10,
      y: 10,
      d: "M0 0 L80 0 L40 70 Z",
      gradient: {
        type: "linear",
        from: { x: 0, y: 0 },
        to: { x: 80, y: 0 },
        stops: [
          { offset: 0, color: "#22cc22" },
          { offset: 1, color: "#2222cc" },
        ],
      },
      ...extra,
    });
    const noStroke = renderFrame(scene([tri({})], "#ffffff"), 0);
    const transparentStroke = renderFrame(scene([tri({ stroke: "transparent" })], "#ffffff"), 0);
    expect(pixelsEqual(noStroke.pixels, transparentStroke.pixels)).toBe(true); // no phantom black outline
  });

  it("rejects a crash-inducing radial inner circle, all-zero, and tiny dash", () => {
    const errs = (n: Partial<Node>): string[] =>
      validateScene(scene([{ id: "x", type: "rect", x: 0, y: 0, width: 10, height: 10, ...n } as Node])).errors.map(
        (e) => e.property ?? "",
      );
    expect(
      errs({
        gradient: {
          type: "radial",
          center: { x: 5, y: 5 },
          radius: 5,
          innerCenter: { x: 5 },
          stops: [
            { offset: 0, color: "#fff" },
            { offset: 1, color: "#000" },
          ],
        },
      } as Partial<Node>),
    ).toContain("gradient");
    expect(errs({ dash: [0, 0] } as Partial<Node>)).toContain("dash");
    expect(errs({ dash: [0.1, 0.1] } as Partial<Node>)).toContain("dash"); // sub-pixel total → DoS guard
  });
});

describe("paint validation", () => {
  it("accepts valid paint props + backdrop", () => {
    const ok = scene(
      [
        {
          id: "a",
          type: "rect",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          gradient: {
            type: "linear",
            from: { x: 0, y: 0 },
            to: { x: 10, y: 0 },
            stops: [
              { offset: 0, color: "#fff" },
              { offset: 1, color: "#000" },
            ],
          },
          shadow: { blur: 4 },
          dash: [4, 2],
          dashOffset: 1,
        },
      ],
      { fill: "#102030", vignette: 0.3, grain: 0.1 },
    );
    expect(validateScene(ok).valid).toBe(true);
  });
  it("rejects malformed paint props + backdrop", () => {
    const errs = (n: Partial<Node>, bg?: SceneSpec["background"]): string[] =>
      validateScene(scene([{ id: "x", type: "rect", x: 0, y: 0, width: 10, height: 10, ...n } as Node], bg)).errors.map(
        (e) => e.property ?? "",
      );
    expect(
      errs({
        gradient: { type: "linear", from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, stops: [{ offset: 2, color: "#fff" }] },
      } as Partial<Node>),
    ).toContain("gradient");
    expect(errs({ shadow: { blur: -3 } } as Partial<Node>)).toContain("shadow");
    expect(errs({ dash: [4, -1] } as Partial<Node>)).toContain("dash");
    expect(errs({}, { fill: "#000", vignette: 5 })).toContain("background");
  });
});
