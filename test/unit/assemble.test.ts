import { describe, it, expect } from "vitest";
import { assembleScene, createDefaultRegistry, validateScene } from "../../src/index.js";
import type { GroupNode, TextNode } from "../../src/index.js";

const registry = createDefaultRegistry();

function nodeReq() {
  return {
    placements: [
      { builder: "math.numberLine", params: { from: 0, to: 10 }, slot: "top" as const, caption: "count along the line" },
      { builder: "chem.reaction", params: { reactants: ["2H2", "O2"], products: ["2H2O"] }, slot: "bottom" as const },
    ],
    beat: {
      title: "From counting to chemistry",
      narrationBeats: ["First, we count.", "Then we react!"],
      durationBudgetSec: 8,
    },
    theme: "meadow",
    canvas: { width: 640, height: 360, fps: 30 },
    seed: 42,
  };
}

describe("assembleScene — node-level placements", () => {
  it("produces a valid, themed, narrated SceneSpec", () => {
    const r = assembleScene(registry, nodeReq());
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(validateScene(r.spec).valid).toBe(true);
    expect(r.spec.width).toBe(640);
    expect(r.spec.fps).toBe(30);
    expect(r.spec.seed).toBe(42);
    expect(r.spec.duration).toBe(8);
    expect(r.durationSec).toBe(8);
    // title + one group per placement
    const title = r.spec.nodes.find((n) => n.id === "scene-title") as TextNode;
    expect(title?.text).toBe("From counting to chemistry");
    expect(r.spec.nodes.filter((n) => n.type === "group")).toHaveLength(2);
    // narration spread across the duration
    expect(r.spec.narration?.segments).toHaveLength(2);
    expect(r.spec.narration!.segments![1]!.t).toBeCloseTo(4, 3);
  });

  it("is deterministic: same request -> same hash; different seed -> different hash", () => {
    const a = assembleScene(registry, nodeReq());
    const b = assembleScene(registry, nodeReq());
    const c = assembleScene(registry, { ...nodeReq(), seed: 43 });
    if (!a.ok || !b.ok || !c.ok) throw new Error("expected ok");
    expect(a.specHash).toBe(b.specHash);
    expect(c.specHash).not.toBe(a.specHash);
  });

  it("namespaces ids so the same builder can be placed twice", () => {
    const r = assembleScene(registry, {
      placements: [
        { builder: "math.numberLine", params: { from: 0, to: 5 }, slot: "top" as const },
        { builder: "math.numberLine", params: { from: 0, to: 10 }, slot: "bottom" as const },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(validateScene(r.spec).valid).toBe(true); // duplicate ids would fail validation
  });

  it("staggers entrance animations per placement", () => {
    const r = assembleScene(registry, nodeReq());
    if (!r.ok) throw new Error("expected ok");
    const groups = r.spec.nodes.filter((n) => n.type === "group") as GroupNode[];
    const second = groups[1]!.tracks!.find((t) => t.property === "opacity")!;
    expect(second.keyframes.at(-1)!.t).toBeGreaterThan(groups[0]!.tracks![0]!.keyframes.at(-1)!.t);
  });

  it("honors at/scale overrides", () => {
    const r = assembleScene(registry, {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 10, width: 400 }, at: { x: 320, y: 180 }, scale: 0.5 }],
      canvas: { width: 640, height: 360 },
    });
    if (!r.ok) throw new Error("expected ok");
    const g = r.spec.nodes.find((n) => n.type === "group") as GroupNode;
    expect(g.scale).toBe(0.5);
    expect(g.x).toBeCloseTo(320 - (400 * 0.5) / 2, 5); // centered at `at`
  });
});

describe("assembleScene — scene-level placement", () => {
  it("builds the whole lesson with canvas dims + seed injected", () => {
    const r = assembleScene(registry, {
      placements: [{ builder: "math.graphingLesson", params: { m: 2, b: 1 } }],
      canvas: { width: 320, height: 180, fps: 12 },
      seed: 7,
      theme: "ocean",
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(validateScene(r.spec).valid).toBe(true);
    expect(r.spec.width).toBe(320);
    expect(r.spec.fps).toBe(12);
    expect(r.spec.seed).toBe(7);
  });
});

describe("assembleScene — structured failures", () => {
  it("rejects empty placements, unknown builders, and mixed levels", () => {
    expect(assembleScene(registry, { placements: [] }).ok).toBe(false);

    const unknown = assembleScene(registry, { placements: [{ builder: "nope.builder" }] });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.errors[0]!.message).toContain("unknown builder");

    const mixed = assembleScene(registry, {
      placements: [{ builder: "math.graphingLesson" }, { builder: "math.numberLine", params: { from: 0, to: 1 } }],
    });
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.errors[0]!.message).toContain("never mixed");
  });

  it("reports invalid params as structured errors, not throws", () => {
    const r = assembleScene(registry, { placements: [{ builder: "math.numberLine", params: { from: 5, to: 5 } }] });
    expect(r.ok).toBe(false);
  });
});
