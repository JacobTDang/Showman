import { describe, expect, it } from "vitest";
import { evaluateGeneration } from "../../src/authoring/evaluation.js";
import { defaultRegistry } from "../../src/catalog/index.js";
import type { SceneSpec } from "../../src/spec/types.js";

const request = {
  brief: "Explain RC charging with a battery, resistor, capacitor, equation, and the 63.2% time-constant marker",
  topic: "RC charging",
  depth: "deep" as const,
  objectives: [
    "Connect switch closure to decreasing current and increasing capacitor voltage",
    "Explain the exponential charging equation",
  ],
  mustShow: ["battery", "resistor", "capacitor", "63.2%"],
};

const provenance = { author: "fixture", model: "deterministic", provider: "offline" };

describe("semantic and pedagogical generation eval", () => {
  it("fails the reported RC-to-percentage reproduction despite schema validity and visible pixels", () => {
    const unrelated: SceneSpec = {
      specVersion: 1,
      width: 640,
      height: 360,
      fps: 10,
      duration: 2,
      background: "#ffffff",
      nodes: [{ id: "wrong", type: "text", text: "Percents: 2% — 2 out of every 100", x: 80, y: 120, fontSize: 32 }],
    };
    const score = evaluateGeneration(unrelated, request, provenance);
    expect(score.structural.valid).toBe(true);
    expect(score.visual.nonBlankFrames).toBe(3);
    expect(score.semantic.passed).toBe(false);
    expect(score.passed).toBe(false);
    expect(score.provenance).toEqual(provenance);
  });

  it("separately passes structural, semantic, pedagogical, and sampled-frame relevance for the RC primitive", () => {
    const built = defaultRegistry().invokeNode("physics.rcCharging", {
      resistanceOhms: 1000,
      capacitanceFarads: 0.001,
      sourceVolts: 5,
      switchTimeSec: 1,
      animationDurationSec: 6,
    });
    const spec: SceneSpec = { specVersion: 1, width: 900, height: 500, fps: 10, duration: 8, background: "#ffffff", nodes: [built.node] };
    const score = evaluateGeneration(spec, request, provenance);
    expect(score.structural.score).toBe(1);
    expect(score.semantic.score).toBe(1);
    expect(score.pedagogical.score).toBeGreaterThanOrEqual(0.75);
    expect(score.visual).toMatchObject({ relevant: true, nonBlankFrames: 3 });
    expect(score.passed).toBe(true);
  });
});
