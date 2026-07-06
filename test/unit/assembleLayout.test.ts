/**
 * Roadmap C2: grid layout (slot: "grid") + the post-layout overlap guard.
 */
import { describe, it, expect } from "vitest";
import { assembleScene, createDefaultRegistry, validateScene } from "../../src/index.js";
import type { GroupNode } from "../../src/index.js";

const registry = createDefaultRegistry();

function groups(spec: { nodes: unknown[] }): GroupNode[] {
  return spec.nodes.filter((n): n is GroupNode => (n as GroupNode).type === "group" && (n as GroupNode).id.startsWith("placement-"));
}

function rectOf(g: GroupNode): { x0: number; y0: number; x1: number; y1: number } {
  // The catalog's numberLine bbox is a fixed width/height per its params; scale defaults to 1.
  const x = g.x ?? 0;
  const y = g.y ?? 0;
  const s = g.scale ?? 1;
  return { x0: x, y0: y, x1: x + 400 * s, y1: y + 56 * s };
}

function overlaps(a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

describe("C2 — grid slot layout", () => {
  it("arranges 2 grid placements side by side (no vertical overlap issue, distinct x)", () => {
    const r = assembleScene(registry, {
      placements: [
        { builder: "math.numberLine", params: { from: 0, to: 5 }, slot: "grid" },
        { builder: "math.numberLine", params: { from: 0, to: 10 }, slot: "grid" },
      ],
      canvas: { width: 1280, height: 720 },
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(validateScene(r.spec).valid).toBe(true);
    const gs = groups(r.spec);
    expect(gs).toHaveLength(2);
    // side-by-side: distinct x centers, same row (close y)
    expect(gs[0]!.x ?? 0).not.toBeCloseTo(gs[1]!.x ?? 0, 0);
    expect(Math.abs((gs[0]!.y ?? 0) - (gs[1]!.y ?? 0))).toBeLessThan(1);
  });

  it("arranges 4 grid placements into a 2x2 layout (two distinct rows)", () => {
    const placements = Array.from({ length: 4 }, (_, k) => ({
      builder: "math.numberLine" as const,
      params: { from: 0, to: 5 + k },
      slot: "grid" as const,
    }));
    const r = assembleScene(registry, { placements, canvas: { width: 1280, height: 720 } });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const gs = groups(r.spec);
    expect(gs).toHaveLength(4);
    const ys = new Set(gs.map((g) => Math.round(g.y ?? 0)));
    expect(ys.size).toBe(2); // two rows
  });

  it("centers a partial last row (3 items -> row of 2 then a centered single)", () => {
    const placements = Array.from({ length: 3 }, (_, k) => ({
      builder: "math.numberLine" as const,
      params: { from: 0, to: 5 + k },
      slot: "grid" as const,
    }));
    const r = assembleScene(registry, { placements, canvas: { width: 1280, height: 720 } });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const gs = groups(r.spec);
    // The lone third item's row should be centered on the canvas midline, not flush left.
    const centerX = (gs[2]!.x ?? 0) + (400 * (gs[2]!.scale ?? 1)) / 2;
    expect(centerX).toBeCloseTo(640, 0);
  });

  it("no two grid placement bboxes overlap in the suite (C2 acceptance bar)", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const placements = Array.from({ length: n }, (_, k) => ({
        builder: "math.numberLine" as const,
        params: { from: 0, to: 5 + k },
        slot: "grid" as const,
      }));
      const r = assembleScene(registry, { placements, canvas: { width: 1280, height: 720 } });
      if (!r.ok) throw new Error(JSON.stringify(r.errors));
      const gs = groups(r.spec);
      for (let i = 0; i < gs.length; i++) {
        for (let j = i + 1; j < gs.length; j++) {
          expect(overlaps(rectOf(gs[i]!), rectOf(gs[j]!))).toBe(false);
        }
      }
    }
  });

  it("an explicit 'at' override wins over slot:'grid'", () => {
    const r = assembleScene(registry, {
      placements: [
        { builder: "math.numberLine", params: { from: 0, to: 5 }, slot: "grid", at: { x: 100, y: 100 } },
        { builder: "math.numberLine", params: { from: 0, to: 10 }, slot: "grid" },
      ],
      canvas: { width: 1280, height: 720 },
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const gs = groups(r.spec);
    expect(gs[0]!.x).toBeCloseTo(100 - 400 / 2, 5);
    expect(gs[0]!.y).toBeCloseTo(100 - 56 / 2, 5);
  });
});

describe("C2 — overlap guard", () => {
  it("shrinks the larger of two placements forced to the same 'at' point and records a repair", () => {
    const r = assembleScene(registry, {
      placements: [
        { builder: "math.numberLine", params: { from: 0, to: 5, width: 300 }, at: { x: 400, y: 300 }, scale: 1 },
        { builder: "math.numberLine", params: { from: 0, to: 10, width: 300 }, at: { x: 400, y: 300 }, scale: 2 },
      ],
      canvas: { width: 1280, height: 720 },
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(validateScene(r.spec).valid).toBe(true);
    const gs = groups(r.spec);
    // placement 1 (scale 2, the larger) must have been shrunk below its requested
    // scale (a scale of exactly 1 is omitted from the emitted node, hence the ?? 1).
    expect(gs[1]!.scale ?? 1).toBeLessThan(2);
    expect(r.repaired.some((s) => s.includes("shrunk placement 1"))).toBe(true);
    // placement 0 (already the smaller) is untouched.
    expect(gs[0]!.scale ?? 1).toBe(1);
  });

  it("does not touch placements that don't meaningfully overlap", () => {
    const r = assembleScene(registry, {
      placements: [
        { builder: "math.numberLine", params: { from: 0, to: 5 }, slot: "left" },
        { builder: "math.numberLine", params: { from: 0, to: 5 }, slot: "right" },
      ],
      canvas: { width: 1280, height: 720 },
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.repaired).toHaveLength(0);
  });

  it("stays deterministic: same overlapping request -> same hash and same repair notes", () => {
    const req = {
      placements: [
        { builder: "math.numberLine" as const, params: { from: 0, to: 5 }, at: { x: 300, y: 300 } },
        { builder: "math.numberLine" as const, params: { from: 0, to: 10 }, at: { x: 300, y: 300 } },
      ],
      canvas: { width: 1280, height: 720 },
    };
    const a = assembleScene(registry, req);
    const b = assembleScene(registry, req);
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.specHash).toBe(b.specHash);
    expect(a.repaired).toEqual(b.repaired);
  });
});
