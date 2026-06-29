import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, icon } from "../../src/index.js";
import type { SceneSpec, Node } from "../../src/index.js";

const { icon: makeIcon, iconNames, ICONS } = icon;
function scene(nodes: Node[], camera?: SceneSpec["camera"]): SceneSpec {
  return {
    specVersion: SPEC_VERSION,
    width: 200,
    height: 160,
    fps: 10,
    duration: 1,
    seed: 1,
    background: "#ffffff",
    ...(camera ? { camera } : {}),
    nodes,
  };
}

describe("icon", () => {
  it("renders a known icon as a scaled path; unknown → nothing", () => {
    const c = makeIcon({ id: "i", name: "check", x: 10, y: 10, size: 48 }) as {
      type: string;
      d?: string;
      scaleX?: number;
      stroke?: string;
      fill?: string;
      strokeWidth?: number;
    };
    expect(c.type).toBe("path");
    expect(c.d).toBe(ICONS.check!.d);
    expect(c.scaleX).toBe(2); // 48/24
    expect(c.stroke).toBeDefined(); // check is stroked
    expect(c.fill).toBe("transparent");
    expect(c.strokeWidth).toBeCloseTo(1); // 2 / scale(2) → constant visual width
    const unknown = makeIcon({ name: "nope", x: 0, y: 0 }) as { type: string; children?: unknown[] };
    expect(unknown.type).toBe("group");
    expect(unknown.children).toHaveLength(0);
  });
  it("paints filled icons solid", () => {
    const star = makeIcon({ id: "s", name: "star", x: 0, y: 0, color: "#f59e0b" }) as { fill?: string; stroke?: string };
    expect(star.fill).toBe("#f59e0b");
    expect(star.stroke).toBeUndefined();
  });
  it("offers a set of names and produces a valid scene", () => {
    expect(iconNames().length).toBeGreaterThan(20);
    const nodes = iconNames().map((name, i) =>
      makeIcon({ id: `i${i}`, name, x: (i % 6) * 30 + 5, y: Math.floor(i / 6) * 30 + 5, size: 22 }),
    );
    expect(validateScene(scene(nodes))).toMatchObject({ valid: true });
  });
});

describe("camera", () => {
  const node: Node = { id: "r", type: "rect", x: 80, y: 60, width: 40, height: 40, fill: "#2563eb" };
  it("zoom changes the rendered frame", () => {
    const z1 = renderFrame(scene([node], { x: 100, y: 80, zoom: 1 }), 0);
    const z2 = renderFrame(scene([node], { x: 100, y: 80, zoom: 2 }), 0);
    expect(Buffer.from(z1.pixels).equals(Buffer.from(z2.pixels))).toBe(false);
  });
  it("an identity camera is byte-identical to no camera", () => {
    const without = renderFrame(scene([node]), 0);
    const identity = renderFrame(scene([node], {}), 0); // all defaults → identity transform
    expect(Buffer.from(without.pixels).equals(Buffer.from(identity.pixels))).toBe(true);
  });
  it("animates a push-in (zoom track) and stays deterministic", () => {
    const s = scene([node], {
      x: 100,
      y: 80,
      zoom: 1,
      tracks: [
        {
          property: "zoom",
          keyframes: [
            { t: 0, value: 1 },
            { t: 1, value: 2.5 },
          ],
        },
      ],
    });
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 9).pixels))).toBe(false); // pushes in
    expect(Buffer.from(renderFrame(s, 5).pixels).equals(Buffer.from(renderFrame(s, 5).pixels))).toBe(true); // deterministic
  });
  it("validates camera bounds + track property", () => {
    expect(validateScene(scene([node], { zoom: 0 })).valid).toBe(false); // zoom must be > 0
    expect(validateScene(scene([node], { tracks: [{ property: "scale" as "zoom", keyframes: [{ t: 0, value: 1 }] }] })).valid).toBe(false); // bad property
    expect(validateScene(scene([node], { x: 50, zoom: 1.5 })).valid).toBe(true);
  });
});
