import { describe, it, expect } from "vitest";
import { autoRepairSpec, validateScene, describeScene, AuthoringAgent } from "../../src/index.js";
import type { ShowmanClient, SpecAuthor, AuthorContext } from "../../src/index.js";

function invalidButMechanical(): Record<string, unknown> {
  // Every error here is something a machine can fix without asking the model again.
  return {
    specVersion: 2, // UNSUPPORTED_VERSION → set to 1
    width: 64,
    height: 64,
    fps: 5,
    duration: 0.4,
    background: "#ffffff",
    nodes: [
      {
        id: "d",
        type: "ellipse",
        x: 10,
        y: 10,
        width: 40,
        height: 40,
        fill: "#e63946",
        opacity: 1.8, // OUT_OF_RANGE 0..1 → clamp to 1
        strokeWidht: 2, // UNKNOWN_PROPERTY → rename to strokeWidth
        tracks: [
          {
            property: "opacity",
            keyframes: [
              { t: 0, value: 0, easing: "easeOutQuadd" }, // INVALID_EASING → easeOutQuad
              { t: 0.2, value: 1 },
            ],
          },
        ],
      },
    ],
  };
}

describe("autoRepairSpec — mechanical, zero-LLM repair", () => {
  it("clamps ranges, renames typo'd keys, fixes easings, and bumps the version", () => {
    const bad = invalidButMechanical();
    expect(validateScene(bad).valid).toBe(false);

    const { spec, fixed } = autoRepairSpec(bad, validateScene(bad).errors);
    expect(validateScene(spec).valid).toBe(true);
    expect(fixed.length).toBeGreaterThanOrEqual(4);

    const node = (spec as { nodes: Array<Record<string, unknown>> }).nodes[0]!;
    expect((spec as { specVersion: number }).specVersion).toBe(1);
    expect(node.opacity).toBe(1);
    expect(node.strokeWidth).toBe(2);
    expect("strokeWidht" in node).toBe(false);
  });

  it("does not mutate the input spec (works on a deep clone)", () => {
    const bad = invalidButMechanical();
    autoRepairSpec(bad, validateScene(bad).errors);
    expect(bad.specVersion).toBe(2); // original untouched
  });

  it("drops a typo'd key when the suggested key already exists", () => {
    const spec = {
      specVersion: 1,
      width: 64,
      height: 64,
      fps: 5,
      duration: 0.4,
      nodes: [{ id: "a", type: "ellipse", x: 0, y: 0, width: 10, height: 10, fill: "#000000", fil: "#fff" }],
    };
    const { spec: out, fixed } = autoRepairSpec(spec, validateScene(spec).errors);
    expect(fixed.some((f) => /dropped duplicate/.test(f))).toBe(true);
    const node = (out as { nodes: Array<Record<string, unknown>> }).nodes[0]!;
    expect("fil" in node).toBe(false);
    expect(node.fill).toBe("#000000");
  });

  it("returns the original untouched when nothing is mechanically fixable", () => {
    const spec = { specVersion: 1, width: 64, height: 64, fps: 5, duration: 0.4, nodes: "not-an-array" };
    const { fixed } = autoRepairSpec(spec, validateScene(spec).errors);
    expect(fixed).toEqual([]);
  });
});

/** A SpecAuthor that records how many times it was asked to propose. */
class CountingAuthor implements SpecAuthor {
  calls = 0;
  constructor(private readonly spec: unknown) {}
  async propose(_brief: string, _ctx: AuthorContext): Promise<unknown> {
    this.calls++;
    return this.spec;
  }
}

/** Minimal in-memory client: real schema + real validator, no rendering. */
function fakeClient(): ShowmanClient {
  return {
    async getSchema() {
      return describeScene();
    },
    async validate(spec: unknown) {
      return validateScene(spec);
    },
    async preview(_spec: unknown, frame: number) {
      return { ok: true as const, pngBase64: "", width: 1, height: 1, frame };
    },
    async submit() {
      return { ok: true as const, jobId: "job-1" };
    },
    async status() {
      return null;
    },
    async generate() {
      return { ok: false as const, error: "unused", attempts: 0 };
    },
  };
}

describe("authoring loop uses auto-repair to save an LLM round-trip", () => {
  it("repairs a mechanically-fixable spec on attempt 1 without re-proposing", async () => {
    const author = new CountingAuthor(invalidButMechanical());
    const agent = new AuthoringAgent(fakeClient(), author, { maxAttempts: 3 });

    const result = await agent.authorSpec("a friendly red dot");

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1); // fixed in place — no second LLM call
    expect(author.calls).toBe(1);
    expect(result.history[0]!.valid).toBe(true);
    expect(result.history[0]!.repaired?.length).toBeGreaterThan(0);
    expect(validateScene(result.spec).valid).toBe(true);
  });
});
