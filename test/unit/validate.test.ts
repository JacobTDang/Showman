import { describe, it, expect } from "vitest";
import { validateScene, assertValidScene, SPEC_VERSION } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";

function baseScene(overrides: Partial<SceneSpec> = {}): SceneSpec {
  return {
    specVersion: SPEC_VERSION,
    width: 320,
    height: 180,
    fps: 30,
    duration: 2,
    background: "#fdf6e3",
    nodes: [{ id: "box", type: "rect", x: 10, y: 10, width: 50, height: 50, fill: "#268bd2" }],
    ...overrides,
  };
}

const codes = (spec: unknown): string[] => validateScene(spec).errors.map((e) => e.code);

describe("validateScene", () => {
  it("accepts a well-formed scene", () => {
    const res = validateScene(baseScene());
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("accepts an animated scene with tracks and easing", () => {
    const spec = baseScene({
      nodes: [
        {
          id: "mover",
          type: "rect",
          fill: "#e63946",
          tracks: [
            { property: "x", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 100, easing: "easeOutBack" }] },
            { property: "fill", keyframes: [{ t: 0, value: "#e63946" }, { t: 1, value: "#457b9d" }] },
            { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 0.5, value: 1, easing: [0.42, 0, 0.58, 1] }] },
          ],
        },
      ],
    });
    expect(validateScene(spec).valid).toBe(true);
  });

  it("never throws on garbage input", () => {
    expect(() => validateScene(null)).not.toThrow();
    expect(() => validateScene(42)).not.toThrow();
    expect(() => validateScene("nope")).not.toThrow();
    expect(() => validateScene([])).not.toThrow();
    expect(validateScene(null).valid).toBe(false);
  });

  it("rejects a wrong specVersion", () => {
    expect(codes(baseScene({ specVersion: 999 }))).toContain("UNSUPPORTED_VERSION");
  });

  it("rejects bad dimensions / fps / duration", () => {
    expect(codes(baseScene({ width: 0 }))).toContain("OUT_OF_RANGE");
    expect(codes(baseScene({ width: 12.5 }))).toContain("INVALID_TYPE");
    expect(codes(baseScene({ fps: 1000 }))).toContain("OUT_OF_RANGE");
    expect(codes(baseScene({ duration: -1 }))).toContain("OUT_OF_RANGE");
  });

  it("flags an invalid background color", () => {
    expect(codes(baseScene({ background: "chartreuse-ish" }))).toContain("INVALID_COLOR");
  });

  it("flags unknown top-level fields with a suggestion", () => {
    const res = validateScene({ ...baseScene(), durationn: 2 } as unknown);
    const e = res.errors.find((x) => x.code === "UNKNOWN_PROPERTY");
    expect(e).toBeDefined();
    expect(e!.message).toContain("durationn");
    expect(e!.message.toLowerCase()).toContain("did you mean");
  });

  it("flags an unknown node property (synonym, no close match)", () => {
    const spec = baseScene({ nodes: [{ id: "b", type: "rect", colour: "#fff" } as never] });
    const res = validateScene(spec);
    const e = res.errors.find((x) => x.code === "UNKNOWN_PROPERTY" && x.property === "colour");
    expect(e).toBeDefined();
    expect(e!.nodeId).toBe("b");
  });

  it("offers a did-you-mean hint for a close typo", () => {
    const spec = baseScene({ nodes: [{ id: "b", type: "rect", widht: 50 } as never] });
    const e = validateScene(spec).errors.find((x) => x.code === "UNKNOWN_PROPERTY" && x.property === "widht");
    expect(e).toBeDefined();
    expect(e!.message).toContain('Did you mean "width"');
  });

  it("rejects an unknown node type", () => {
    const res = validateScene(baseScene({ nodes: [{ id: "x", type: "triangle" } as never] }));
    expect(res.errors.some((e) => e.code === "UNKNOWN_TYPE")).toBe(true);
  });

  it("rejects duplicate ids", () => {
    const spec = baseScene({
      nodes: [
        { id: "dup", type: "rect" },
        { id: "dup", type: "ellipse" },
      ],
    });
    expect(codes(spec)).toContain("DUPLICATE_ID");
  });

  it("requires non-empty id", () => {
    expect(codes(baseScene({ nodes: [{ id: "", type: "rect" } as never] }))).toContain("MISSING_FIELD");
  });

  it("requires text on a text node", () => {
    expect(codes(baseScene({ nodes: [{ id: "t", type: "text" } as never] }))).toContain("MISSING_FIELD");
  });

  it("validates opacity range", () => {
    expect(codes(baseScene({ nodes: [{ id: "n", type: "rect", opacity: 1.5 }] }))).toContain("OUT_OF_RANGE");
  });

  it("rejects negative geometry", () => {
    expect(codes(baseScene({ nodes: [{ id: "n", type: "rect", width: -5 }] }))).toContain("OUT_OF_RANGE");
  });

  it("rejects animating a property not valid for the node type", () => {
    const spec = baseScene({
      nodes: [{ id: "t", type: "text", text: "hi", tracks: [{ property: "width", keyframes: [{ t: 0, value: 1 }] }] }],
    });
    expect(codes(spec)).toContain("INVALID_PROPERTY");
  });

  it("rejects a color keyframe on a numeric property and vice versa", () => {
    const colorOnNumber = baseScene({
      nodes: [{ id: "n", type: "rect", tracks: [{ property: "x", keyframes: [{ t: 0, value: "#fff" }] }] }],
    });
    expect(codes(colorOnNumber)).toContain("INVALID_TYPE");

    const numberOnColor = baseScene({
      nodes: [{ id: "n", type: "rect", tracks: [{ property: "fill", keyframes: [{ t: 0, value: 5 }] }] }],
    });
    expect(codes(numberOnColor)).toContain("INVALID_COLOR");
  });

  it("requires strictly ascending keyframe times", () => {
    const spec = baseScene({
      nodes: [{ id: "n", type: "rect", tracks: [{ property: "x", keyframes: [{ t: 1, value: 0 }, { t: 1, value: 5 }] }] }],
    });
    expect(codes(spec)).toContain("NOT_ASCENDING");
  });

  it("rejects an empty keyframe list", () => {
    const spec = baseScene({ nodes: [{ id: "n", type: "rect", tracks: [{ property: "x", keyframes: [] }] }] });
    expect(codes(spec)).toContain("EMPTY");
  });

  it("rejects an unknown easing with a suggestion", () => {
    const spec = baseScene({
      nodes: [{ id: "n", type: "rect", tracks: [{ property: "x", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1, easing: "easeOutBak" as never }] }] }],
    });
    const e = validateScene(spec).errors.find((x) => x.code === "INVALID_EASING");
    expect(e).toBeDefined();
    expect(e!.message).toContain("easeOutBack");
  });

  it("validates nested group children and depth", () => {
    const spec = baseScene({
      nodes: [
        {
          id: "g",
          type: "group",
          x: 10,
          children: [{ id: "inner", type: "rect", width: -3 }],
        },
      ],
    });
    const res = validateScene(spec);
    const e = res.errors.find((x) => x.code === "OUT_OF_RANGE");
    expect(e).toBeDefined();
    expect(e!.path).toContain("children[0]");
  });

  it("requires group children to be an array", () => {
    expect(codes(baseScene({ nodes: [{ id: "g", type: "group" } as never] }))).toContain("MISSING_FIELD");
  });

  describe("assertValidScene", () => {
    it("returns the narrowed spec when valid", () => {
      const spec = baseScene();
      expect(assertValidScene(spec)).toBe(spec);
    });
    it("throws a readable summary when invalid", () => {
      expect(() => assertValidScene({ specVersion: 1 })).toThrow(/Invalid scene spec/);
    });
  });
});
