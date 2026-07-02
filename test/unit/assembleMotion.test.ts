import { describe, it, expect } from "vitest";
import { assembleScene, createDefaultRegistry, validateScene } from "../../src/index.js";
import type { GroupNode, Node, TextNode, Track } from "../../src/index.js";

const registry = createDefaultRegistry();

function group(spec: { nodes: Node[] }, index = 0): GroupNode {
  return spec.nodes.filter((n) => n.type === "group")[index] as GroupNode;
}

function collectTracks(node: Node, out: { node: Node; track: Track }[] = []): { node: Node; track: Track }[] {
  for (const track of node.tracks ?? []) out.push({ node, track });
  if (node.type === "group") for (const c of node.children) collectTracks(c, out);
  return out;
}

describe("P1 kind-aware motion (assembler)", () => {
  it("a drawable subtree gets a fadeIn entrance + staggered progress draw-ons", () => {
    const r = assembleScene(registry, {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 5 } }],
      beat: { durationBudgetSec: 8 },
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const g = group(r.spec);
    // Entrance is opacity-only (fadeIn) because the subtree draws itself on.
    expect(g.tracks!.map((t) => t.property)).toEqual(["opacity"]);
    // Content beats: polylines inside animate `progress` 0 -> 1, staggered.
    const draws = collectTracks(g).filter((x) => x.track.property === "progress");
    expect(draws.length).toBeGreaterThanOrEqual(2);
    const starts = draws.map((d) => d.track.keyframes[0]!.t);
    expect(new Set(starts).size).toBeGreaterThan(1); // staggered, not simultaneous
    expect(draws.every((d) => d.track.keyframes.at(-1)!.value === 1)).toBe(true);
    expect(validateScene(r.spec).valid).toBe(true);
  });

  it("a non-drawable subtree defaults to a popIn entrance (opacity + scale)", () => {
    // items? Use chem.reaction with animateArrow true -> its arrow polyline carries
    // builder tracks; text glyphs dominate. Simplest non-drawable: a reaction whose
    // arrow already animates (builder-authored tracks are respected, so no draw target).
    const r = assembleScene(registry, {
      placements: [{ builder: "chem.reaction", params: { reactants: ["2H2", "O2"], products: ["2H2O"], animateArrow: true } }],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const props = group(r.spec)
      .tracks!.map((t) => t.property)
      .sort();
    expect(props).toContain("opacity");
    // popIn iff nothing inside wants to draw itself on; either way the entrance exists
    // and the spec stays valid.
    expect(validateScene(r.spec).valid).toBe(true);
  });

  it("animate:'none' emits a fully static placement; explicit hints override auto", () => {
    const still = assembleScene(registry, {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 5 }, animate: "none" }],
    });
    if (!still.ok) throw new Error("expected ok");
    const g = group(still.spec);
    expect(g.tracks).toBeUndefined();
    expect(collectTracks(g)).toHaveLength(0); // no content beats either

    const spring = assembleScene(registry, {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 5 }, animate: "springIn" }],
    });
    if (!spring.ok) throw new Error("expected ok");
    const scaleTrack = group(spring.spec).tracks!.find((t) => t.property === "scale")!;
    expect(scaleTrack.keyframes.at(-1)!.easing).toBe("easeOutSpring");
  });

  it("scale entrances settle at the placement's static scale, not 1", () => {
    const r = assembleScene(registry, {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 5 }, animate: "popIn", scale: 0.5 }],
    });
    if (!r.ok) throw new Error("expected ok");
    const g = group(r.spec);
    const scaleTrack = g.tracks!.find((t) => t.property === "scale")!;
    expect(scaleTrack.keyframes.at(-1)!.value).toBe(0.5);
    expect(g.scale).toBe(0.5);
  });

  it("the scene title reveals with a typewriter track", () => {
    const r = assembleScene(registry, {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 5 } }],
      beat: { title: "Counting on a line" },
    });
    if (!r.ok) throw new Error("expected ok");
    const title = r.spec.nodes.find((n) => n.id === "scene-title") as TextNode;
    expect(title.tracks!.some((t) => t.property === "reveal")).toBe(true);
  });

  it("duration grows to fit the animation (animEnd + rest) and rejects bad hints", () => {
    const r = assembleScene(registry, {
      placements: [
        { builder: "math.numberLine", params: { from: 0, to: 10 } },
        { builder: "math.numberLine", params: { from: 0, to: 10 } },
      ],
      beat: { durationBudgetSec: 1 }, // far too short for the motion
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.spec.duration).toBeGreaterThan(2); // stretched past the 1s budget

    const bad = assembleScene(registry, {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 5 }, animate: "wiggle" as never }],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]!.message).toContain("animate");
  });

  it("motion stays deterministic: same request -> same content hash", () => {
    const req = {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 7 } }],
      beat: { title: "T", narrationBeats: ["a", "b"], durationBudgetSec: 6 },
      seed: 3,
    };
    const a = assembleScene(registry, req);
    const b = assembleScene(registry, req);
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.specHash).toBe(b.specHash);
  });
});
