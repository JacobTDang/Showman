import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, chart } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";

const { barChart, lineChart, areaChart, scatterChart, candlestick, formatTick, niceCeil, niceTicks, seriesColors } = chart;
function scene(n: Node, w = 420, h = 300): SceneSpec {
  return { specVersion: SPEC_VERSION, width: w, height: h, fps: 1, duration: 1, seed: 1, background: "#ffffff", nodes: [n] };
}
const kids = (g: Node): Node[] => (g as GroupNode).children;
const ok = (n: Node, w = 420, h = 300): boolean => validateScene(scene(n, w, h)).valid;

describe("formatting", () => {
  it("formats numbers / currency / percent / compact deterministically", () => {
    expect(formatTick(1234567, "number")).toBe("1,234,567");
    expect(formatTick(1200, "currency")).toBe("$1,200");
    expect(formatTick(25, "percent")).toBe("25%");
    expect(formatTick(3400000, "compact")).toBe("3.4M");
    expect(formatTick(1234, "compact")).toBe("1.2K");
  });
  it("niceCeil rounds an axis max up to 1/2/5×10^n", () => {
    expect(niceCeil(180)).toBe(200);
    expect(niceCeil(42)).toBe(50);
    expect(niceCeil(8)).toBe(10);
  });
  it("niceTicks produces round, evenly-spaced labels", () => {
    expect(niceTicks(0, 68, 5).values).toEqual([0, 20, 40, 60, 80]); // not 0/13.6/27.2/…
    expect(niceTicks(0, 5, 5).values).toEqual([0, 1, 2, 3, 4, 5]);
    expect(niceTicks(-3, 7, 5).values).toEqual([-4, -2, 0, 2, 4, 6, 8]); // spans negatives
    const flat = niceTicks(5, 5, 5); // degenerate (min == max) → still a sane axis, no NaN
    expect(flat.values.every((v) => Number.isFinite(v))).toBe(true);
    expect(flat.values.length).toBeGreaterThan(1);
  });
  it("palette yields n series colors", () => {
    expect(seriesColors("daylight", 3)).toHaveLength(3);
  });
});

describe("barChart", () => {
  const opts = {
    x: 10,
    y: 10,
    width: 380,
    height: 260,
    categories: ["A", "B", "C"],
    series: [
      { name: "x", values: [10, 30, 20] },
      { name: "y", values: [15, 25, 35] },
    ],
  };
  it("draws grouped bars (2 series × 3 categories = 6) with a legend, and validates", () => {
    const c = barChart({ ...opts, title: "T", yFormat: "currency" });
    expect(kids(c).filter((n) => n.id.includes("-bar-"))).toHaveLength(6);
    expect(kids(c).some((n) => n.id.includes("-leg-"))).toBe(true); // legend for 2 series
    expect(ok(c)).toBe(true);
  });
  it("stacks when asked, and grows from the baseline when animated", () => {
    const c = barChart({ ...opts, stacked: true, animate: true });
    const bar = kids(c).find((n) => n.id.includes("-bar-")) as { tracks?: { property: string }[]; anchor?: unknown };
    expect(bar.tracks?.[0]?.property).toBe("scaleY");
    expect(bar.anchor).toBeDefined(); // scales from its bottom edge
    expect(ok(c)).toBe(true);
  });
  it("maps data → pixels: bar height is proportional to value (min=0 linear scale)", () => {
    const c = barChart({
      id: "bc",
      x: 10,
      y: 10,
      width: 380,
      height: 260,
      categories: ["A", "B", "C"],
      series: [{ name: "x", values: [10, 30, 20] }],
    });
    const h = (ci: number): number => (kids(c).find((n) => n.id === `bc-bar-${ci}-0`) as { height: number }).height;
    expect(h(1)).toBeGreaterThan(h(0));
    expect(h(1)).toBeCloseTo(h(0) * 3, 1); // value 30 vs 10 → 3× the pixels
    expect(h(2)).toBeCloseTo(h(0) * 2, 1); // value 20 vs 10 → 2×
  });
  it("stacks the second series directly on top of the first (no gap/overlap)", () => {
    const c = barChart({
      id: "bc",
      x: 10,
      y: 10,
      width: 380,
      height: 260,
      stacked: true,
      categories: ["A"],
      series: [
        { name: "x", values: [10] },
        { name: "y", values: [20] },
      ],
    });
    const b0 = kids(c).find((n) => n.id === "bc-bar-0-0") as { y: number; height: number };
    const b1 = kids(c).find((n) => n.id === "bc-bar-0-1") as { y: number; height: number };
    expect(b1.y + b1.height).toBeCloseTo(b0.y, 1); // series-1's bottom edge meets series-0's top edge
    expect(b1.height).toBeCloseTo(b0.height * 2, 1); // height still encodes value (20 vs 10)
  });
  it("survives degenerate data (empty series, all-negative values) without crashing", () => {
    expect(() => barChart({ id: "e1", x: 10, y: 10, width: 380, height: 260, categories: [], series: [] })).not.toThrow();
    expect(() =>
      barChart({ id: "e2", x: 10, y: 10, width: 380, height: 260, categories: ["A", "B"], series: [{ name: "n", values: [-5, -10] }] }),
    ).not.toThrow();
    // no bars drawn for all-negative data (every h ≤ 0.5 is skipped), but the axes/scaffold are still valid
    const neg = barChart({
      id: "e2",
      x: 10,
      y: 10,
      width: 380,
      height: 260,
      categories: ["A", "B"],
      series: [{ name: "n", values: [-5, -10] }],
    });
    expect(kids(neg).filter((n) => n.id.includes("-bar-"))).toHaveLength(0);
  });
});

describe("lineChart", () => {
  it("draws a polyline per series with draw-on + points, and validates", () => {
    const c = lineChart({
      x: 10,
      y: 10,
      width: 380,
      height: 260,
      showPoints: true,
      animate: true,
      series: [
        {
          name: "s",
          points: [
            { x: 0, y: 1 },
            { x: 1, y: 3 },
            { x: 2, y: 2 },
          ],
        },
      ],
    });
    const line = kids(c).find((n) => n.id.includes("-line-")) as { tracks?: { property: string }[] };
    expect(line.tracks?.[0]?.property).toBe("progress"); // draws on
    expect(kids(c).filter((n) => n.id.includes("-pt-"))).toHaveLength(3);
    expect(ok(c)).toBe(true);
  });
});

describe("areaChart + scatter", () => {
  it("area: a gradient fill + a top line, valid", () => {
    const c = areaChart({
      x: 10,
      y: 10,
      width: 380,
      height: 240,
      points: [
        { x: 0, y: 2 },
        { x: 1, y: 5 },
        { x: 2, y: 3 },
      ],
    });
    expect(kids(c).some((n) => n.id.endsWith("-fill"))).toBe(true);
    expect(kids(c).some((n) => n.id.endsWith("-line"))).toBe(true);
    expect(ok(c)).toBe(true);
  });
  it("scatter: a dot per point, popping in when animated", () => {
    const c = scatterChart({
      x: 10,
      y: 10,
      width: 380,
      height: 240,
      animate: true,
      series: [
        {
          name: "s",
          points: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
        },
      ],
    });
    const dots = kids(c).filter((n) => n.id.includes("-pt-"));
    expect(dots).toHaveLength(2);
    // animate:true must actually attach a pop-in (scale) track — not be a silent no-op.
    expect((dots[0] as { tracks?: { property: string }[] }).tracks?.some((t) => t.property === "scale")).toBe(true);
    expect(ok(c)).toBe(true);
  });
});

describe("candlestick", () => {
  it("colors up/down candles and draws wick + body, valid", () => {
    const c = candlestick({
      x: 10,
      y: 10,
      width: 380,
      height: 240,
      yFormat: "currency",
      candles: [
        { open: 100, high: 110, low: 95, close: 108 },
        { open: 108, high: 112, low: 102, close: 104 },
      ],
    });
    const bodies = kids(c).filter((n) => n.id.includes("-body-")) as { fill?: string }[];
    expect(bodies[0]!.fill).toBe("#16a34a"); // up (close>open) green
    expect(bodies[1]!.fill).toBe("#dc2626"); // down red
    expect(kids(c).filter((n) => n.id.includes("-wick-"))).toHaveLength(2);
    expect(ok(c)).toBe(true);
  });
  it("renders deterministically", () => {
    const c = candlestick({ x: 10, y: 10, width: 380, height: 240, candles: [{ open: 1, high: 3, low: 0, close: 2 }] });
    const s = scene(c);
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 0).pixels))).toBe(true);
  });
});
