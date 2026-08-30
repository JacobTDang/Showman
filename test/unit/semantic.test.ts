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
  // The token that identifies the topic is often the shortest one in the brief.
  it("accepts a scene that answers the brief in domain notation", () => {
    const spec = scene("V_C(t) = V_0 (1 - e^(-t/RC))");
    spec.nodes.push(
      { id: "r", type: "text", text: "R", x: 10, y: 40 },
      { id: "c", type: "text", text: "C", x: 10, y: 60 },
      { id: "tau", type: "text", text: "Time Constant (RC)", x: 10, y: 80 },
      { id: "cap", type: "text", text: "Voltage across capacitor", x: 10, y: 100 },
    );
    expect(
      checkSemanticAdherence(spec, {
        brief: "Show current flowing through an RC circuit, then connect it to the charging equation",
      }),
    ).toMatchObject({ status: "passed", passed: true });
  });

  it("rejects an unrelated lesson that merely echoes one generic word", () => {
    // The original failure: an arithmetic lesson returned for a circuits brief.
    // It contains "equation", which must not be enough on its own.
    expect(
      checkSemanticAdherence(scene("An equation is like a balance scale. On the left we have 2 plus 3."), {
        brief: "Show current flowing through an RC circuit, then connect it to the charging equation",
      }),
    ).toMatchObject({ status: "failed", passed: false });
  });

  it("accepts corroborating descriptive terms when a brief has no acronym", () => {
    expect(
      checkSemanticAdherence(scene("Resonant Frequency of a Series Circuit"), {
        brief: "Derive the resonant frequency of a series circuit",
      }),
    ).toMatchObject({ passed: true });
  });

  it("still rejects a single descriptive match when a brief has no acronym", () => {
    expect(
      checkSemanticAdherence(scene("A frequency is how often something repeats"), {
        brief: "Derive the resonant impedance of a series network",
      }),
    ).toMatchObject({ passed: false });
  });

  it("does not let a short anchor match inside an unrelated word", () => {
    // "percent" contains "rc"; a substring match let a percentages lesson pass
    // a circuits brief.
    expect(
      checkSemanticAdherence(scene("Percent means out of one hundred. The ring is 2 percent full."), {
        brief: "Show current flowing through an RC circuit, then connect it to the charging equation",
      }),
    ).toMatchObject({ status: "failed", passed: false });
  });

  it("still matches an inflected form of a required term", () => {
    expect(
      checkSemanticAdherence(scene("Two capacitors in series, and their resonant behaviour"), {
        brief: "Explain capacitor resonant behaviour",
      }),
    ).toMatchObject({ passed: true });
  });

  it("still rejects an unrelated scene for the same brief", () => {
    expect(
      checkSemanticAdherence(scene("Let's count to 3! We counted 3 shapes."), {
        brief: "Show current flowing through an RC circuit, then connect it to the charging equation",
      }),
    ).toMatchObject({ status: "failed", passed: false });
  });

  it.each([
    ["RLC", "Series RLC resonance", "Impedance is minimal at RLC resonance"],
    ["ADC", "Explain ADC quantisation error", "ADC step size"],
    ["PID", "Tune a PID controller", "PID gains"],
  ])("keeps the %s acronym as an anchor", (_name, brief, visible) => {
    expect(checkSemanticAdherence(scene(visible), { brief })).toMatchObject({ passed: true });
  });

  it("reports that inferred anchors are alternatives, not all required", () => {
    const check = checkSemanticAdherence(scene("Count to three"), { brief: "Explain a Bode plot" });
    expect(check.passed).toBe(false);
    expect(check.inferredAlternatives).toBe(true);
  });

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
