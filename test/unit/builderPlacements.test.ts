import { describe, expect, it } from "vitest";
import { expandBuilderPlacements } from "../../src/authoring/builderPlacements.js";
import { defaultRegistry } from "../../src/catalog/index.js";

const base = () => ({
  specVersion: 1,
  width: 960,
  height: 540,
  fps: 30,
  duration: 5,
  nodes: [{ id: "title", type: "text", text: "Half-wave rectifier", x: 480, y: 60 }],
});

const rectifier = {
  id: "circuit",
  builder: "physics.circuit",
  x: 120,
  y: 200,
  params: {
    elements: [
      { kind: "acSource", label: "12 V AC" },
      { kind: "diode", label: "D" },
      { kind: "resistor", label: "R = 1 kΩ" },
    ],
  },
};

function polylines(node: any, out: any[] = []): any[] {
  if (node?.type === "polyline") out.push(node.points);
  (node?.children ?? []).forEach((c: any) => polylines(c, out));
  return out;
}

describe("builder placements", () => {
  it("leaves a spec without placements untouched", () => {
    const spec = base();
    const result = expandBuilderPlacements(spec, defaultRegistry());
    expect(result.expanded).toEqual([]);
    expect(result.spec).toEqual(spec);
  });

  it("expands a placement into nodes and removes the field", () => {
    const spec: any = { ...base(), builders: [rectifier] };
    const result = expandBuilderPlacements(spec, defaultRegistry());

    expect(result.expanded).toEqual(["physics.circuit"]);
    expect((result.spec as any).builders).toBeUndefined();
    expect((result.spec as any).nodes).toHaveLength(2);
    expect((result.spec as any).nodes[1].id).toBe("circuit");
  });

  // The reason this route exists: freehand schematics come out disconnected --
  // 50 px gaps between wires and components, and no return path at all.
  it("leaves no wire endpoint stranded", () => {
    const spec: any = { ...base(), builders: [rectifier] };
    const segments = polylines((expandBuilderPlacements(spec, defaultRegistry()).spec as any).nodes[1]);
    expect(segments.length).toBeGreaterThan(4);

    const ends = segments.flatMap((p: any[]) => [p[0], p[p.length - 1]]);
    const nearest = (e: any) => Math.min(...ends.filter((o: any) => o !== e).map((o: any) => Math.hypot(o.x - e.x, o.y - e.y)));
    // Symbol glyphs leave a small draughting gap at their leads; a stranded wire
    // is an order of magnitude worse than that.
    expect(Math.max(...ends.map(nearest))).toBeLessThan(15);
  });

  it("closes the loop with a return path", () => {
    const spec: any = { ...base(), builders: [rectifier] };
    const segments = polylines((expandBuilderPlacements(spec, defaultRegistry()).spec as any).nodes[1]);
    const points = segments.flat();
    const xs = points.map((p: any) => p.x);
    const ys = points.map((p: any) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);

    expect(width).toBeGreaterThan(100);
    // A series loop is a rectangle: the return rail sits well below the top one.
    expect(height).toBeGreaterThan(80);
  });

  it("reports an unknown builder instead of throwing", () => {
    const spec: any = { ...base(), builders: [{ id: "x", builder: "physics.nope", params: {} }] };
    const result = expandBuilderPlacements(spec, defaultRegistry());
    expect(result.errors[0]).toMatch(/physics\.nope/);
    expect((result.spec as any).builders).toBeUndefined();
  });

  it("reports invalid params instead of throwing", () => {
    const spec: any = { ...base(), builders: [{ id: "x", builder: "physics.circuit", params: { elements: [] } }] };
    const result = expandBuilderPlacements(spec, defaultRegistry());
    expect(result.errors).toHaveLength(1);
  });
});
