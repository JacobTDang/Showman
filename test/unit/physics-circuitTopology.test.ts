import { describe, expect, it } from "vitest";
import { opAmp } from "../../src/physics/circuit.js";
import type { Node } from "../../src/spec/types.js";
import { createDefaultRegistry, validateScene } from "../../src/index.js";

interface Pt {
  x: number;
  y: number;
}

/**
 * A node's transform, as the renderer applies it: translate(x, y), then rotate about the
 * anchor (src/engine/render.ts:149-155). Tests must compose this, or a rotated element's
 * points read as though it were still horizontal — which would make a connectivity
 * assertion measure the wrong geometry entirely.
 */
function apply(p: Pt, node: { x?: number; y?: number; rotation?: number; anchor?: Pt }): Pt {
  const ax = node.anchor?.x ?? 0;
  const ay = node.anchor?.y ?? 0;
  const rot = ((node.rotation ?? 0) * Math.PI) / 180;
  const dx = p.x - ax;
  const dy = p.y - ay;
  const rx = dx * Math.cos(rot) - dy * Math.sin(rot);
  const ry = dx * Math.sin(rot) + dy * Math.cos(rot);
  return { x: (node.x ?? 0) + ax + rx, y: (node.y ?? 0) + ay + ry };
}

/** Every polyline in a subtree, in the subtree root's coordinate space. */
function polylines(node: unknown, out: Pt[][] = []): Pt[][] {
  const n = node as { type?: string; points?: Pt[]; children?: Node[]; x?: number; y?: number; rotation?: number; anchor?: Pt };
  if (n?.type === "polyline" && Array.isArray(n.points)) out.push(n.points.map((q) => apply(q, n)));
  for (const c of n?.children ?? []) {
    const inner: Pt[][] = [];
    polylines(c, inner);
    for (const line of inner) out.push(line.map((q) => apply(q, n)));
  }
  return out;
}

/** Every wire endpoint in a subtree. */
function endpoints(node: unknown): Pt[] {
  return polylines(node).flatMap((p) => [p[0]!, p[p.length - 1]!]);
}

/** Every terminal dot in a subtree, in the root's coordinate space. A wire may legitimately
 * end at one: an open A–B pair is precisely what a Thevenin equivalent's output is. */
function dots(node: unknown, out: Pt[] = []): Pt[] {
  const n = node as { type?: string; x?: number; y?: number; rotation?: number; anchor?: Pt; children?: Node[] };
  if (n?.type === "ellipse") out.push({ x: n.x ?? 0, y: n.y ?? 0 });
  for (const c of n?.children ?? []) {
    const inner: Pt[] = [];
    dots(c, inner);
    for (const q of inner) out.push(apply(q, n));
  }
  return out;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Every text string in a subtree. */
function texts(node: unknown, out: string[] = []): string[] {
  const n = node as { type?: string; text?: unknown; children?: Node[] };
  if (n?.type === "text") out.push(String(n.text));
  (n?.children ?? []).forEach((c) => texts(c, out));
  return out;
}

/** Every node id in a subtree. */
function ids(node: unknown, out: string[] = []): string[] {
  const n = node as { id?: unknown; children?: Node[] };
  if (typeof n?.id === "string") out.push(n.id);
  (n?.children ?? []).forEach((c) => ids(c, out));
  return out;
}

describe("opAmp symbol", () => {
  it("reports three distinct terminals with the output opposite the inputs", () => {
    const oa = opAmp({ id: "oa", x: 100, y: 100, size: 90 });
    expect(oa.inMinus).not.toEqual(oa.inPlus);
    expect(oa.inMinus.x).toBe(oa.inPlus.x);
    // Inputs on the left, output on the right.
    expect(oa.out.x).toBeGreaterThan(oa.inMinus.x);
    // Inverting input above non-inverting.
    expect(oa.inMinus.y).toBeLessThan(oa.inPlus.y);
    // Output vertically between the two inputs.
    expect(oa.out.y).toBeGreaterThan(oa.inMinus.y);
    expect(oa.out.y).toBeLessThan(oa.inPlus.y);
  });

  it("draws a triangle body, not a rectangle", () => {
    // The reported integrator drew its op-amp as a plain rounded rect.
    const body = polylines(opAmp({ id: "oa", x: 0, y: 0, size: 90 }).node).find((p) => p.length === 3);
    expect(body, "expected a 3-point body polyline").toBeDefined();
    const xs = body!.map((p) => p.x);
    const ys = body!.map((p) => p.y);
    // Two points share the left edge, the apex sits alone on the right.
    expect(xs.filter((x) => x === Math.min(...xs))).toHaveLength(2);
    expect(ys[2]).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2, 5);
  });

  it("marks the inverting and non-inverting inputs", () => {
    const marks = texts(opAmp({ id: "oa", x: 0, y: 0, size: 90 }).node);
    expect(marks).toContain("−");
    expect(marks).toContain("+");
  });

  it("puts every terminal at the end of a lead, so a wire meets a lead not an edge", () => {
    const oa = opAmp({ id: "oa", x: 100, y: 100, size: 90 });
    const ends = endpoints(oa.node);
    for (const t of [oa.inMinus, oa.inPlus, oa.out]) {
      expect(Math.min(...ends.map((e) => dist(e, t))), `no lead ends at ${JSON.stringify(t)}`).toBeLessThan(0.001);
    }
  });
});

describe("physics.voltageDivider", () => {
  const build = () =>
    createDefaultRegistry().invokeNode("physics.voltageDivider", {
      sourceLabel: "12 V",
      r1Label: "R1 = 4 k\u03A9",
      r2Label: "R2 = 2 k\u03A9",
    });

  it("leaves no wire endpoint stranded", () => {
    const node = build().node;
    const ends = endpoints(node);
    const terminals = dots(node);
    expect(ends.length).toBeGreaterThan(8);
    // A wire end must meet another conductor or a marked terminal. Symbol glyphs leave a
    // small draughting gap at their leads; the freehand output this replaces had 50px gaps
    // and no return path at all.
    const nearest = (e: Pt) => Math.min(...[...ends.filter((o) => o !== e), ...terminals].map((o) => dist(o, e)));
    expect(Math.max(...ends.map(nearest))).toBeLessThan(15);
  });

  // THE criterion-2 test: this fails if R2 is placed in series after R1.
  it("draws R2 as a shunt across the output, not in series", () => {
    const node = build().node;
    const segments = polylines(node);
    const ends = endpoints(node);
    const topY = Math.min(...ends.map((p) => p.y));
    const botY = Math.max(...ends.map((p) => p.y));
    const maxX = Math.max(...ends.map((p) => p.x));

    // A vertical run spans the rails somewhere between the source and the output.
    const verticals = segments.filter((p) => Math.abs(p[0]!.x - p[p.length - 1]!.x) < 0.001 && p[0]!.x > 0 && p[0]!.x < maxX);
    expect(verticals.length, "expected a vertical branch between the rails").toBeGreaterThan(0);

    // That column carries conductors touching BOTH rails.
    const columnX = verticals[0]![0]!.x;
    const inColumn = ends.filter((p) => Math.abs(p.x - columnX) < 0.001);
    expect(inColumn.some((p) => Math.abs(p.y - topY) < 0.001), "shunt does not reach the top rail").toBe(true);
    expect(inColumn.some((p) => Math.abs(p.y - botY) < 0.001), "shunt does not reach the return rail").toBe(true);

    // And the top rail continues PAST that column to the output terminal -- R2 taps the
    // rail rather than interrupting it, which is what V = V*R2/(R1+R2) describes.
    expect(maxX).toBeGreaterThan(columnX);
    expect(ends.some((p) => Math.abs(p.y - topY) < 0.001 && Math.abs(p.x - maxX) < 0.001)).toBe(true);
  });

  it("labels both output terminals and the shunt resistor", () => {
    const t = texts(build().node);
    expect(t).toContain("A");
    expect(t).toContain("B");
    expect(t).toContain("R2 = 2 k\u03A9");
  });

  it("keeps every label upright", () => {
    // A rotated element would otherwise drag its label onto its side.
    const rotated: string[] = [];
    const walk = (n: any, spinning = false) => {
      const spins = spinning || (typeof n?.rotation === "number" && n.rotation !== 0);
      if (n?.type === "text" && spins) rotated.push(String(n.text));
      (n?.children ?? []).forEach((c: any) => walk(c, spins));
    };
    walk(build().node);
    expect(rotated).toEqual([]);
  });

  it("produces a valid, deterministic scene", () => {
    const a = build();
    expect(JSON.stringify(a.node)).toBe(JSON.stringify(build().node));
    const scene = { specVersion: 1, width: 800, height: 450, fps: 30, duration: 4, seed: 0, background: "#ffffff", nodes: [a.node] };
    expect(validateScene(scene as never).errors).toEqual([]);
  });
});
