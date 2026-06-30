import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, physics } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode, PolylineNode } from "../../src/index.js";

const { vectorField, pointCharge, emSpectrum, switchSym, inductor, acSource, diode, meter } = physics;
const scene = (nodes: Node[]): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: 760,
  height: 460,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#fff",
  nodes,
});
const kids = (g: Node): Node[] => (g as GroupNode).children;

describe("vectorField", () => {
  it("draws an arrow per non-null grid cell and validates", () => {
    const vf = vectorField({
      id: "vf",
      x: 0,
      y: 0,
      width: 240,
      height: 180,
      cols: 5,
      rows: 4,
      field: (nx, ny) => ({ vx: nx - 0.5, vy: ny - 0.5 }),
    });
    const arrows = kids(vf).filter((n) => /-a\d+$/.test(n.id));
    // No sampled cell is null here (vy never hits 0 over the sampled ny rows), so all 20 draw.
    expect(arrows).toHaveLength(20);
    expect(validateScene(scene([vf]))).toMatchObject({ valid: true });
  });
  it("skips null-magnitude points (no zero-length arrow)", () => {
    const vf = vectorField({ id: "vf", x: 0, y: 0, width: 100, height: 100, cols: 3, rows: 3, field: () => ({ vx: 0, vy: 0 }) });
    expect(kids(vf).filter((n) => /-a\d+$/.test(n.id))).toHaveLength(0);
  });
  it("skips only the cell a field actually nulls (the sampled dead center)", () => {
    // cols:3,rows:3 samples nx,ny ∈ {0,0.5,1}; this field is (0,0) exactly at nx=ny=0.5 — one cell.
    const vf = vectorField({
      id: "vf",
      x: 0,
      y: 0,
      width: 120,
      height: 120,
      cols: 3,
      rows: 3,
      field: (nx, ny) => ({ vx: nx - 0.5, vy: ny - 0.5 }),
    });
    expect(kids(vf).filter((n) => /-a\d+$/.test(n.id))).toHaveLength(8); // 9 cells − 1 null center
  });
  it("scales arrow length with vector magnitude", () => {
    // nx ∈ {0,0.5,1}; |v| = nx so cell i=0 is null, i=1 has |v|=0.5, i=2 has |v|=1 (the longest).
    const vf = vectorField({ id: "vf", x: 0, y: 0, width: 300, height: 200, cols: 3, rows: 2, field: (nx) => ({ vx: nx, vy: 0 }) });
    const lenOf = (k: number): number => {
      const arrow = kids(vf).find((n) => n.id === `vf-a${k}`) as GroupNode;
      const p = (arrow.children.find((n) => n.id === `vf-a${k}-line`) as PolylineNode).points;
      return Math.hypot(p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y);
    };
    expect(lenOf(2)).toBeGreaterThan(lenOf(1)); // larger |v| → longer arrow
  });
});

describe("pointCharge", () => {
  it("renders a glow + core + sign, and field arrows when asked", () => {
    const p = pointCharge({ id: "p", x: 50, y: 50, charge: 1, fieldArrows: true, arrowCount: 6 });
    const glow = kids(p).find((n) => n.id === "p-glow") as { gradient?: unknown };
    expect(glow.gradient).toBeDefined(); // radial-gradient glow (no blur)
    expect((kids(p).find((n) => n.id === "p-sign") as { text?: string }).text).toBe("+");
    expect(kids(p).filter((n) => /-f\d+$/.test(n.id))).toHaveLength(6);
    const neg = pointCharge({ id: "n", x: 0, y: 0, charge: -2 });
    expect((kids(neg).find((n) => n.id === "n-sign") as { text?: string }).text).toBe("−");
    expect(validateScene(scene([p, neg]))).toMatchObject({ valid: true });
  });
  it("+ field arrows point outward, − field arrows point inward", () => {
    const cx = 100;
    const cy = 100;
    const dist = (pt: { x: number; y: number }): number => Math.hypot(pt.x - cx, pt.y - cy);
    const arrowLine = (g: Node, fid: string): { x: number; y: number }[] => {
      const arrow = kids(g).find((n) => n.id === fid) as GroupNode;
      return (arrow.children.find((n) => n.id === `${fid}-line`) as PolylineNode).points;
    };
    const pos = arrowLine(pointCharge({ id: "pp", x: cx, y: cy, charge: 1, fieldArrows: true, arrowCount: 8 }), "pp-f0");
    expect(dist(pos[pos.length - 1]!)).toBeGreaterThan(dist(pos[0]!)); // arrowhead farther from charge → outward
    const neg = arrowLine(pointCharge({ id: "nn", x: cx, y: cy, charge: -1, fieldArrows: true, arrowCount: 8 }), "nn-f0");
    expect(dist(neg[neg.length - 1]!)).toBeLessThan(dist(neg[0]!)); // arrowhead nearer the charge → inward
  });
});

describe("emSpectrum", () => {
  it("lays out the labeled bands with a rainbow visible window", () => {
    const em = emSpectrum({ id: "em", x: 0, y: 0, width: 500 });
    expect(kids(em).filter((n) => /-b\d+$/.test(n.id))).toHaveLength(7); // 7 bands
    const visible = kids(em).find((n) => n.id === "em-b3") as { gradient?: unknown };
    expect(visible.gradient).toBeDefined(); // visible band is a rainbow gradient
    expect(validateScene(scene([em]))).toMatchObject({ valid: true });
  });
});

describe("circuit symbol expansion", () => {
  it("each new symbol exposes left/right terminals and validates", () => {
    for (const sym of [switchSym, inductor, acSource, diode]) {
      const s = sym({ x: 10, y: 50, size: 80, label: "X" });
      expect(s.a).toEqual({ x: 10, y: 50 });
      expect(s.b).toEqual({ x: 90, y: 50 });
      expect(validateScene(scene([s.node]))).toMatchObject({ valid: true });
    }
  });
  it("meter shows its symbol letter", () => {
    const m = meter({ id: "m", x: 0, y: 40, size: 70, symbol: "V" });
    expect((kids(m.node).find((n) => n.id === "m-sym") as { text?: string }).text).toBe("V");
  });
  it("an inductor has a multi-bump coil polyline", () => {
    const ind = inductor({ id: "ind", x: 0, y: 40, size: 80 });
    const coil = kids(ind.node).find((n) => n.id === "ind-coil") as { points?: unknown[] };
    expect(coil.points!.length).toBe(34); // start + 4 bumps × 8 samples + end
  });
});
