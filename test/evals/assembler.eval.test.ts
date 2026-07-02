/**
 * Offline assembler evals (Graph Perfection P6, offline tier).
 *
 * The quality bar from GRAPH_PERFECTION.md §2, executable: every scene the assembler
 * emits for a representative brief suite must (1) carry at least two distinct motion
 * kinds, (2) align narration segment k with animation beat k within ±0.25s, (3) derive
 * its duration from the timeline. Pure spec inspection — no rendering, no network, no
 * key — so it runs in normal CI and fails the build when quality regresses.
 */

import { describe, it, expect } from "vitest";
import { assembleScene, createDefaultRegistry } from "../../src/index.js";
import type { AssembleRequest, GroupNode, Node, SceneSpec, Track } from "../../src/index.js";

const registry = createDefaultRegistry();

/** The brief suite: representative node-level scenes across domains. */
const SUITE: { name: string; req: AssembleRequest }[] = [
  {
    name: "number line with narration",
    req: {
      placements: [{ builder: "math.numberLine", params: { from: 0, to: 10 } }],
      beat: { title: "Counting", narrationBeats: ["Here is a number line.", "Count along the ticks with me."], durationBudgetSec: 10 },
    },
  },
  {
    name: "reaction + caption",
    req: {
      placements: [{ builder: "chem.reaction", params: { reactants: ["2H2", "O2"], products: ["2H2O"] }, caption: "making water" }],
      beat: { title: "A reaction", narrationBeats: ["Hydrogen meets oxygen.", "Together they make water!"] },
    },
  },
  {
    name: "two placements, three lines",
    req: {
      placements: [
        { builder: "math.numberLine", params: { from: 0, to: 5 }, slot: "top" },
        { builder: "items.card", params: { title: "Key idea", lines: ["Numbers live on a line."] }, slot: "bottom" },
      ],
      beat: {
        title: "Numbers on a line",
        narrationBeats: ["Look at the line.", "Here is the key idea.", "Let's remember it."],
        durationBudgetSec: 14,
      },
    },
  },
  {
    name: "card only (fallback shape)",
    req: {
      placements: [{ builder: "items.card", params: { title: "Let's think", lines: ["One", "Two"] }, animate: "fadeIn" }],
      beat: { title: "A thought", narrationBeats: ["Just one thought."] },
    },
  },
];

function walkTracks(node: Node, out: Track[] = []): Track[] {
  for (const t of node.tracks ?? []) out.push(t);
  if (node.type === "group") for (const c of node.children) walkTracks(c, out);
  return out;
}

function motionKinds(spec: SceneSpec): Set<string> {
  const kinds = new Set<string>();
  for (const node of spec.nodes) for (const t of walkTracks(node)) kinds.add(t.property);
  return kinds;
}

function placementGroups(spec: SceneSpec): GroupNode[] {
  return spec.nodes.filter((n): n is GroupNode => n.type === "group" && n.id.startsWith("placement-"));
}

describe("assembler quality bar (offline evals)", () => {
  for (const { name, req } of SUITE) {
    describe(name, () => {
      const result = assembleScene(registry, req);
      if (!result.ok) throw new Error(`${name}: ${JSON.stringify(result.errors)}`);
      const spec = result.spec;

      it("has at least two distinct motion kinds", () => {
        // e.g. opacity + progress, or opacity + scale + reveal — never a lone fade.
        expect(motionKinds(spec).size).toBeGreaterThanOrEqual(2);
      });

      it("aligns narration segment k with animation beat k (±0.25s)", () => {
        const segs = spec.narration?.segments ?? [];
        const groups = placementGroups(spec);
        expect(segs.length).toBeGreaterThan(0);
        segs.forEach((seg, k) => {
          if (k >= groups.length) return; // tail lines have no beat by design
          const entrance = groups[k]!.tracks?.find((t) => t.property === "opacity");
          if (!entrance) return; // animate:"none" scenes opt out
          expect(Math.abs(seg.t - entrance.keyframes[0]!.t)).toBeLessThanOrEqual(0.25);
        });
      });

      it("derives duration from the timeline (fits speech + motion + rest)", () => {
        const segs = spec.narration?.segments ?? [];
        const lastSpeech = segs.length ? segs.at(-1)!.t + (segs.at(-1)!.duration ?? 0) : 0;
        let lastMotion = 0;
        for (const node of spec.nodes)
          for (const t of walkTracks(node)) for (const kf of t.keyframes) lastMotion = Math.max(lastMotion, kf.t);
        expect(spec.duration).toBeGreaterThanOrEqual(Math.max(lastSpeech, lastMotion));
        expect(spec.duration).toBeLessThanOrEqual(600);
      });

      it("stays deterministic (same request -> same hash)", () => {
        const again = assembleScene(registry, req);
        if (!again.ok) throw new Error("re-assembly failed");
        expect(again.specHash).toBe(result.specHash);
      });
    });
  }
});
