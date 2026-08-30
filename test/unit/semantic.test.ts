import { describe, expect, it } from "vitest";
import { checkSemanticAdherence } from "../../src/authoring/semantic.js";
import type { SceneSpec } from "../../src/spec/types.js";

function scene(text: string, id = "node"): SceneSpec {
  return {
    specVersion: 1,
    width: 320,
    height: 180,
    fps: 10,
    duration: 1,
    nodes: [{ id, type: "text", text, x: 10, y: 10 }],
  };
}

describe("semantic adherence", () => {
  it.each(["series RLC resonance", "inverting op-amp gain", "Thevenin equivalent", "Bode plot"])(
    "rejects unrelated visible content for %s",
    (brief) => {
      expect(checkSemanticAdherence(scene("Count to three"), { brief })).toMatchObject({ status: "failed", passed: false });
    },
  );

  it("matches only visible text, not ids or other serialized properties", () => {
    expect(checkSemanticAdherence(scene("Count to three", "bode-plot-resonance"), { brief: "Explain a Bode plot" })).toMatchObject({
      status: "failed",
      passed: false,
    });
    expect(checkSemanticAdherence(scene("Bode magnitude plot"), { brief: "Explain a Bode plot" })).toMatchObject({
      status: "passed",
      passed: true,
    });
  });

  it("reports unchecked when no usable anchors or constraints are available", () => {
    expect(checkSemanticAdherence(scene("Anything"), { brief: "show it" })).toMatchObject({
      status: "unchecked",
      passed: false,
      required: [],
    });
  });
});
