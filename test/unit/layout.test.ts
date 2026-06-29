import { describe, it, expect } from "vitest";
import { layout, validateScene, SPEC_VERSION, getTheme } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";

const { frame, inset, center, column, row, grid, centerOf, titleSlide, bulletSlide } = layout;

describe("layout geometry", () => {
  it("insets uniformly and per-side", () => {
    expect(inset(frame(100, 100), 10)).toEqual({ x: 10, y: 10, width: 80, height: 80 });
    expect(inset(frame(100, 100), { left: 20, top: 5 })).toEqual({ x: 20, y: 5, width: 80, height: 95 });
  });
  it("splits into columns and rows that tile the area with gaps", () => {
    const cols = row(frame(100, 40), 3, { gap: 10 });
    expect(cols).toHaveLength(3);
    expect(cols[0]!.width).toBeCloseTo((100 - 20) / 3); // (area - 2 gaps) / 3
    expect(cols[2]!.x).toBeCloseTo(cols[1]!.x + cols[1]!.width + 10);
    const rows = column(frame(40, 100), 4, { gap: 4 });
    expect(rows[3]!.y + rows[3]!.height).toBeCloseTo(100);
  });
  it("builds a row-major grid", () => {
    const cells = grid(frame(100, 100), 2, 2, 0);
    expect(cells).toHaveLength(4);
    expect(cells[0]).toEqual({ x: 0, y: 0, width: 50, height: 50 });
    expect(cells[3]).toEqual({ x: 50, y: 50, width: 50, height: 50 });
  });
  it("centers a box and reports its center", () => {
    expect(center(frame(100, 100), 40, 20)).toEqual({ x: 30, y: 40, width: 40, height: 20 });
    expect(centerOf({ x: 10, y: 10, width: 20, height: 40 })).toEqual({ x: 20, y: 30 });
  });
  it("returns empty for non-positive counts", () => {
    expect(grid(frame(10, 10), 0, 3)).toEqual([]);
    expect(column(frame(10, 10), 0)).toEqual([]);
  });
});

describe("slide templates", () => {
  function asScene(nodes: SceneSpec["nodes"], theme = "daylight"): SceneSpec {
    return {
      specVersion: SPEC_VERSION,
      width: 1280,
      height: 720,
      fps: 1,
      duration: 1,
      seed: 1,
      background: getTheme(theme).palette.bg,
      nodes,
    };
  }
  it("title slide is schema-valid and themed", () => {
    const nodes = titleSlide({
      title: "Intro to Distributed Systems",
      subtitle: "Consistency, availability, and the tradeoffs",
      theme: "slate",
    });
    expect(nodes.length).toBe(2);
    const res = validateScene(asScene(nodes, "slate"));
    expect(res.valid).toBe(true);
    expect(nodes[0]!.type).toBe("text");
  });
  it("bullet slide wraps + staggers and stays schema-valid", () => {
    const nodes = bulletSlide({
      title: "Key properties",
      bullets: [
        "Linearizability is the strongest single-object guarantee",
        "Availability means every request gets a non-error response",
        "You cannot have both under a partition",
      ],
      theme: "daylight",
    });
    expect(nodes.length).toBe(4); // heading + 3 bullets
    const res = validateScene(asScene(nodes));
    expect(res.valid).toBe(true);
    // bullets carry a staggered opacity reveal
    const bullet = nodes[1] as { tracks?: unknown[] };
    expect(Array.isArray(bullet.tracks)).toBe(true);
  });
});
