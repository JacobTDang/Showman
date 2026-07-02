import { describe, it, expect } from "vitest";
import { assembleScene, createDefaultRegistry } from "../../src/index.js";
import type { GroupNode, Node } from "../../src/index.js";

const registry = createDefaultRegistry();

function groups(spec: { nodes: Node[] }): GroupNode[] {
  return spec.nodes.filter((n) => n.type === "group") as GroupNode[];
}

function entranceStart(g: GroupNode): number {
  return g.tracks!.find((t) => t.property === "opacity")!.keyframes[0]!.t;
}

describe("P2 timeline-first narration sync", () => {
  it("narration segment k starts exactly when placement k's entrance does", () => {
    const r = assembleScene(registry, {
      placements: [
        { builder: "math.numberLine", params: { from: 0, to: 5 } },
        { builder: "chem.reaction", params: { reactants: ["2H2", "O2"], products: ["2H2O"] } },
      ],
      beat: {
        title: "Two things",
        narrationBeats: ["First, look at the number line drawing itself.", "Now watch the reaction appear."],
        durationBudgetSec: 20,
      },
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const segs = r.spec.narration!.segments!;
    const gs = groups(r.spec);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.t).toBeCloseTo(entranceStart(gs[0]!), 3);
    expect(segs[1]!.t).toBeCloseTo(entranceStart(gs[1]!), 3);
    // Slot 1 starts after slot 0's speech AND motion both finish.
    expect(segs[1]!.t).toBeGreaterThan(segs[0]!.t + 1);
  });

  it("slots stretch to the longer of speech and motion", () => {
    // A long spoken line over a quick visual: the slot must fit the speech.
    const r = assembleScene(registry, {
      placements: [
        { builder: "chem.reaction", params: { reactants: ["2H2", "O2"], products: ["2H2O"], animateArrow: true }, animate: "popIn" },
        { builder: "chem.reaction", params: { reactants: ["N2", "3H2"], products: ["2NH3"], animateArrow: true }, animate: "popIn" },
      ],
      beat: {
        narrationBeats: [
          "This first reaction combines hydrogen and oxygen and it takes quite a while to explain every part of it carefully.",
          "Short line.",
        ],
      },
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const segs = r.spec.narration!.segments!;
    const words = segs[0]!.text.split(/\s+/).length;
    const expectedSpeech = Math.max(1.4, words / 2.6 + 0.4);
    // Slot 0 spans at least the speech estimate: segment 1 can't start earlier.
    expect(segs[1]!.t).toBeGreaterThanOrEqual(expectedSpeech - 0.001);
  });

  it("extra narration lines get their own tail slots (speech continues after motion)", () => {
    const r = assembleScene(registry, {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 5 } }],
      beat: { narrationBeats: ["Watch the line.", "Here is a second thought.", "And a closing one."] },
    });
    if (!r.ok) throw new Error("expected ok");
    const segs = r.spec.narration!.segments!;
    expect(segs).toHaveLength(3);
    expect(segs[1]!.t).toBeGreaterThan(segs[0]!.t);
    expect(segs[2]!.t).toBeGreaterThan(segs[1]!.t);
    // The scene lasts past the final line plus rest.
    const lastEnd = segs[2]!.t + segs[2]!.duration!;
    expect(r.spec.duration).toBeGreaterThanOrEqual(lastEnd);
  });

  it("duration derives from the timeline, not a guess; budget still floors it", () => {
    const short = assembleScene(registry, {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 3 } }],
      beat: { narrationBeats: ["Quick."], durationBudgetSec: 15 },
    });
    if (!short.ok) throw new Error("expected ok");
    expect(short.spec.duration).toBe(15); // budget floors a short timeline

    const long = assembleScene(registry, {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 3 } }],
      beat: {
        narrationBeats: [
          "This is a very long explanation that goes on and on covering many separate ideas one after the other.",
          "And then continues with even more detail about every single tick on the line.",
          "Before finally wrapping up with a summary of everything we saw.",
        ],
        durationBudgetSec: 2, // far too short for the speech
      },
    });
    if (!long.ok) throw new Error("expected ok");
    expect(long.spec.duration).toBeGreaterThan(8); // stretched to fit the words
  });

  it("no narration falls back to the light stagger and stays deterministic", () => {
    const req = {
      placements: [
        { builder: "math.numberLine", params: { from: 0, to: 5 } },
        { builder: "math.numberLine", params: { from: 0, to: 9 } },
      ],
      seed: 5,
    };
    const a = assembleScene(registry, req);
    const b = assembleScene(registry, req);
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.spec.narration).toBeUndefined();
    const gs = groups(a.spec);
    expect(entranceStart(gs[1]!)).toBeCloseTo(entranceStart(gs[0]!) + 0.35, 3);
    expect(a.specHash).toBe(b.specHash);
  });
});
