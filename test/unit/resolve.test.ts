import { describe, it, expect } from "vitest";
import { resolveTransform, NodeResolver } from "../../src/engine/resolve.js";
import type { Node } from "../../src/index.js";

describe("resolveTransform", () => {
  it("applies defaults when nothing is set", () => {
    const node: Node = { id: "n", type: "rect" };
    const tf = resolveTransform(node, 0);
    expect(tf).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, anchorX: 0, anchorY: 0 });
  });

  it("uses static values", () => {
    const node: Node = { id: "n", type: "rect", x: 5, y: 7, rotation: 90, opacity: 0.5 };
    const tf = resolveTransform(node, 0);
    expect(tf.x).toBe(5);
    expect(tf.y).toBe(7);
    expect(tf.rotation).toBe(90);
    expect(tf.opacity).toBe(0.5);
  });

  it("scale fills scaleX/scaleY, which override per-axis", () => {
    expect(resolveTransform({ id: "n", type: "rect", scale: 2 }, 0)).toMatchObject({ scaleX: 2, scaleY: 2 });
    expect(resolveTransform({ id: "n", type: "rect", scale: 2, scaleX: 3 }, 0)).toMatchObject({ scaleX: 3, scaleY: 2 });
  });

  it("clamps opacity into [0,1]", () => {
    expect(resolveTransform({ id: "n", type: "rect", opacity: 5 }, 0).opacity).toBe(1);
    expect(resolveTransform({ id: "n", type: "rect", opacity: -1 }, 0).opacity).toBe(0);
  });

  it("reads anchor", () => {
    const tf = resolveTransform({ id: "n", type: "rect", anchor: { x: 25, y: 25 } }, 0);
    expect(tf.anchorX).toBe(25);
    expect(tf.anchorY).toBe(25);
  });

  it("a track overrides the static value at time t", () => {
    const node: Node = {
      id: "n",
      type: "rect",
      x: 0,
      tracks: [
        {
          property: "x",
          keyframes: [
            { t: 0, value: 0 },
            { t: 1, value: 100 },
          ],
        },
      ],
    };
    expect(resolveTransform(node, 0).x).toBe(0);
    expect(resolveTransform(node, 0.5).x).toBe(50);
    expect(resolveTransform(node, 1).x).toBe(100);
  });
});

describe("NodeResolver", () => {
  it("resolves shape props with static and track precedence", () => {
    const node: Node = {
      id: "n",
      type: "rect",
      width: 40,
      fill: "#112233",
      tracks: [
        {
          property: "width",
          keyframes: [
            { t: 0, value: 40 },
            { t: 1, value: 80 },
          ],
        },
      ],
    };
    const r0 = new NodeResolver(node, 0);
    expect(r0.num("width", 100)).toBe(40);
    expect(r0.color("fill")).toBe("#112233");
    const r1 = new NodeResolver(node, 1);
    expect(r1.num("width", 100)).toBe(80); // track wins
  });

  it("falls back to default when prop is absent", () => {
    const r = new NodeResolver({ id: "n", type: "rect" }, 0);
    expect(r.num("width", 100)).toBe(100);
    expect(r.color("fill")).toBeUndefined();
    expect(r.str("text")).toBeUndefined();
  });
});
