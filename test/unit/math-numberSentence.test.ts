import { describe, it, expect } from "vitest";
import { renderFrame, validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import { buildNumberSentence } from "../../src/math/numberSentence.js";
import { samplePixel, isColorNear } from "../helpers.js";

function scene(nodes: Node[], w = 640, h = 220): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: "#ffffff", nodes };
}

/** Flatten the node tree so we can scan every descendant regardless of grouping. */
function flatten(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    out.push(n);
    if (n.type === "group") out.push(...flatten(n.children));
  }
  return out;
}

const textNodes = (n: Node) => flatten([n]).filter((c): c is Extract<Node, { type: "text" }> => c.type === "text");
const counters = (n: Node) => flatten([n]).filter((c): c is Extract<Node, { type: "counter" }> => c.type === "counter");
const ellipses = (n: Node) => flatten([n]).filter((c): c is Extract<Node, { type: "ellipse" }> => c.type === "ellipse");

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

describe("number sentence", () => {
  it("builds a valid scene with the operator, equals and the numbers", () => {
    const g = buildNumberSentence({ id: "ns", x: 24, y: 30, a: 3, op: "+", b: 4, result: 7 });
    const spec = scene([g]);
    expect(validateScene(spec).valid).toBe(true);

    // A text node carries the operator glyph, and another carries "=".
    const combined = textNodes(g)
      .map((t) => t.text)
      .join(" ");
    expect(combined).toContain("+");
    expect(combined).toContain("=");

    // The operands and the answer appear as counter values.
    const values = counters(g).map((c) => c.value);
    expect(values).toContain(3);
    expect(values).toContain(4);
    expect(values).toContain(7);
  });

  it("maps subtraction onto the proper minus glyph (U+2212)", () => {
    const g = buildNumberSentence({ a: 9, op: "-", b: 4, result: 5 });
    const combined = textNodes(g)
      .map((t) => t.text)
      .join(" ");
    expect(combined).toContain("−"); // not an ASCII hyphen
  });

  it("renders a row of counting dots under the operands", () => {
    const g = buildNumberSentence({ id: "ns", x: 10, y: 20, a: 3, op: "×", b: 2, result: 6 });
    const spec = scene([g]);
    expect(validateScene(spec).valid).toBe(true);

    const dots = ellipses(g);
    expect(dots.length).toBe(3 + 2); // 3 under `a`, 2 under `b`

    // depth: each dot is a sphere — a radial chip gradient that fades to its exact declared fill.
    const dot = dots[0] as {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      fill?: string;
      gradient?: { stops: { color: string }[] };
    };
    expect(dot.gradient?.stops.at(-1)?.color).toBe(dot.fill);
    // …and it actually paints: the chip lightens the center, but it stays a clear shade of that fill.
    const gx = g.x ?? 0;
    const gy = g.y ?? 0;
    const cx = Math.round(gx + (dot.x ?? 0) + (dot.width ?? 0) / 2);
    const cy = Math.round(gy + (dot.y ?? 0) + (dot.height ?? 0) / 2);
    const frame = renderFrame(spec, 0);
    expect(isColorNear(samplePixel(frame, cx, cy), hexRgb(dot.fill as string), 50)).toBe(true);
  });

  it("omits the dots when showDots is false", () => {
    const g = buildNumberSentence({ a: 3, op: "+", b: 4, result: 7, showDots: false });
    expect(ellipses(g).length).toBe(0);
  });

  it("is a pure function of its options", () => {
    const o = { id: "ns", x: 5, y: 5, a: 5, op: "÷" as const, b: 1, result: 5 };
    expect(JSON.stringify(buildNumberSentence(o))).toBe(JSON.stringify(buildNumberSentence(o)));
  });
});
