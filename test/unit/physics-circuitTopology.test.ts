import { describe, expect, it } from "vitest";
import { opAmp } from "../../src/physics/circuit.js";
import type { Node } from "../../src/spec/types.js";

interface Pt {
  x: number;
  y: number;
}

/** Every polyline in a subtree, as its raw point list. */
function polylines(node: unknown, out: Pt[][] = []): Pt[][] {
  const n = node as { type?: string; points?: Pt[]; children?: Node[] };
  if (n?.type === "polyline" && Array.isArray(n.points)) out.push(n.points);
  (n?.children ?? []).forEach((c) => polylines(c, out));
  return out;
}

/** Every wire endpoint in a subtree. */
function endpoints(node: unknown): Pt[] {
  return polylines(node).flatMap((p) => [p[0]!, p[p.length - 1]!]);
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

export { polylines, endpoints, dist, texts, ids };
