import { describe, expect, it } from "vitest";
import { createDefaultRegistry, validateScene } from "../../src/index.js";
import { ROUTABLE_LESSONS, selectEeLesson } from "../../src/authoring/lessonRouting.js";
import { AuthoringAgent, ScriptedAuthor, type SpecAuthor } from "../../src/authoring/agent.js";

describe("selectEeLesson", () => {
  const cases: Array<[string, string]> = [
    ["Explain theorem 1 with an RC circuit", "ee.theoremOne"],
    ["Explain the sinusoidal steady state response of an RC network", "ee.theoremOne"],
    ["Explain the frequency response of an RC lowpass filter", "ee.rcFilters"],
    ["Compare a low-pass and a high-pass RC filter", "ee.rcFilters"],
    ["What is a transfer characteristic and what does clipping look like?", "ee.transferCharacteristic"],
    ["Show how a pole location affects the step response", "ee.polesStepResponse"],
    ["What are the amplitude, frequency and phase of a sinusoid?", "ee.sinusoids"],
    ["Explain phasors and impedance", "ee.impedancePhasors"],
    ["Why does current lead voltage in a capacitor?", "ee.capacitorInductor"],
    ["Explain Ohm's law, KVL and KCL", "ee.ohmKvlKcl"],
  ];
  for (const [brief, name] of cases) {
    it(`"${brief}" -> ${name}`, () => {
      expect(selectEeLesson({ brief })?.name).toBe(name);
    });
  }

  it("declines a brief that names no lesson topic", () => {
    expect(selectEeLesson({ brief: "Explain photosynthesis for a ninth grader" })).toBeNull();
    expect(selectEeLesson({ brief: "Explain the Thevenin equivalent with R1 = 4 kΩ" })).toBeNull();
  });

  it("matches on word boundaries, so a fragment does not misfire", () => {
    expect(selectEeLesson({ brief: "Explain the electric dipole" })).toBeNull();
    expect(selectEeLesson({ brief: "Explain a monopole antenna" })).toBeNull();
  });

  it("declines a brief about two different lessons", () => {
    expect(selectEeLesson({ brief: "Compare Ohm's law with phasors" })).toBeNull();
  });

  it("lets the longest phrase win over a fragment of itself", () => {
    // "sinusoid" alone would pick ee.sinusoids; the full phrase names Theorem 1.
    expect(selectEeLesson({ brief: "the sinusoidal steady state" })?.name).toBe("ee.theoremOne");
  });

  it("never matches the constraints", () => {
    expect(selectEeLesson({ brief: "Explain resistors", forbid: ["phasors", "impedance"] })).toBeNull();
  });

  it("reads the topic and objectives too", () => {
    expect(selectEeLesson({ brief: "Help me with this week's material", topic: "RC filters" })?.name).toBe("ee.rcFilters");
    expect(selectEeLesson({ brief: "Help me", objectives: ["understand the step response"] })?.name).toBe("ee.polesStepResponse");
  });

  it("only ever selects lessons that exist in the catalog", () => {
    const reg = createDefaultRegistry();
    for (const name of ROUTABLE_LESSONS) expect(reg.get(name)?.level, name).toBe("scene");
  });
});

describe("the authoring loop hands a lesson brief to the catalog", () => {
  const stubClient = () =>
    ({
      getSchema: async () => ({}) as never,
      validate: async (spec: unknown) => validateScene(spec as never),
      preview: async () => ({ ok: true, errors: [] }),
      submit: async () => ({ ok: true, jobId: "job-1", errors: [] }),
    }) as never;

  it("returns the lesson without calling the model at all", async () => {
    const never: SpecAuthor = {
      async propose() {
        throw new Error("the model must not be called for a curated lesson");
      },
    };
    const result = await new AuthoringAgent(stubClient(), never).authorSpec("Explain the frequency response of an RC lowpass filter");
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.history[0]?.lesson).toBe("ee.rcFilters");
    expect(result.history[0]?.connectivity?.status).toBe("passed");
    expect(result.history[0]?.a11y).toBeDefined();
    expect(result.spec?.nodes.some((n) => n.id === "ee-title")).toBe(true);
  });

  it("still authors freehand when no lesson is named", async () => {
    const spec = {
      specVersion: 1,
      width: 640,
      height: 360,
      fps: 30,
      duration: 2,
      background: "#ffffff",
      nodes: [{ id: "t", type: "text", text: "photosynthesis", x: 320, y: 180, fontSize: 28, align: "center" }],
    };
    const result = await new AuthoringAgent(stubClient(), new ScriptedAuthor([spec])).authorSpec("Explain photosynthesis");
    expect(result.ok).toBe(true);
    expect(result.history[0]?.lesson).toBeUndefined();
  });
});
