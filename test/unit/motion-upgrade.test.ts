import { describe, it, expect } from "vitest";
import { applyEasing, EASING_NAMES, validateScene, renderFrame, SPEC_VERSION, motion } from "../../src/index.js";
import type { SceneSpec, Node, EasingName, Track } from "../../src/index.js";

describe("easing library", () => {
  it("every named easing maps 0→0 and 1→1 at the boundaries", () => {
    for (const name of EASING_NAMES) {
      expect(applyEasing(name as EasingName, 0)).toBeCloseTo(0, 5);
      expect(applyEasing(name as EasingName, 1)).toBeCloseTo(1, 5);
    }
  });
  it("ships the expanded set (quart/quint/expo/circ + elastic/bounce completeness + spring)", () => {
    for (const name of [
      "easeOutQuart",
      "easeInOutQuint",
      "easeInExpo",
      "easeOutCirc",
      "easeInElastic",
      "easeInOutElastic",
      "easeInBounce",
      "easeInOutBounce",
      "easeOutSpring",
      "easeOutSpringy",
    ]) {
      expect(EASING_NAMES).toContain(name);
    }
  });
  it("springs overshoot past 1 before settling", () => {
    let maxV = 0;
    for (let i = 0; i <= 20; i++) maxV = Math.max(maxV, applyEasing("easeOutSpring", i / 20));
    expect(maxV).toBeGreaterThan(1); // overshoot
  });
  it("a scene using a new easing validates; an unknown easing is rejected", () => {
    const withTrack = (easing: string): SceneSpec => ({
      specVersion: SPEC_VERSION,
      width: 100,
      height: 100,
      fps: 10,
      duration: 1,
      seed: 1,
      background: "#fff",
      nodes: [
        {
          id: "r",
          type: "rect",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          tracks: [
            {
              property: "opacity",
              keyframes: [
                { t: 0, value: 0 },
                { t: 1, value: 1, easing: easing as EasingName },
              ],
            },
          ],
        },
      ],
    });
    expect(validateScene(withTrack("easeOutSpring")).valid).toBe(true);
    expect(validateScene(withTrack("easeBogus")).valid).toBe(false);
  });
});

describe("motion presets", () => {
  it("springIn animates scale via easeOutSpring + a fade that lands before the settle", () => {
    const ts = motion.springIn({ start: 0, duration: 1 });
    const scale = ts.find((t) => t.property === "scale")!;
    expect(scale.keyframes[1]?.easing).toBe("easeOutSpring");
    const opacity = ts.find((t) => t.property === "opacity")!;
    // The fade completes at ~0.6 of the window (not at the very end), with an ease-out-cubic.
    expect(opacity.keyframes[1]!.t).toBeCloseTo(0.6, 5);
    expect(opacity.keyframes[1]!.easing).toBe("easeOutCubic");
  });
  it("drawOn emits an ease-in-out progress reveal (hand-drawn feel)", () => {
    const ts = motion.drawOn({ duration: 1 });
    const prog = ts.find((t) => t.property === "progress")!;
    expect(prog.keyframes.map((k) => k.value)).toEqual([0, 1]);
    expect(prog.keyframes[1]!.easing).toBe("easeInOutSine");
  });
  it("followPath emits x/y tracks through the waypoints, timed evenly", () => {
    const ts = motion.followPath({
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 20 },
        { x: 100, y: 0 },
      ],
      duration: 1,
    });
    const x = ts.find((t) => t.property === "x")!;
    expect(x.keyframes.map((k) => k.value)).toEqual([0, 50, 100]);
    expect(x.keyframes.map((k) => k.t)).toEqual([0, 0.5, 1]); // even spacing
    expect(motion.followPath({ points: [{ x: 0, y: 0 }] })).toHaveLength(0); // <2 points → nothing
  });
  it("a followPath node moves across frames (and stays deterministic)", () => {
    const tracks: Track[] = motion.followPath({
      points: [
        { x: 10, y: 10 },
        { x: 100, y: 40 },
      ],
      duration: 1,
    });
    const node: Node = { id: "d", type: "ellipse", x: 10, y: 10, width: 20, height: 20, fill: "#2563eb", tracks };
    const spec: SceneSpec = {
      specVersion: SPEC_VERSION,
      width: 140,
      height: 80,
      fps: 10,
      duration: 1,
      seed: 1,
      background: "#fff",
      nodes: [node],
    };
    expect(validateScene(spec).valid).toBe(true);
    expect(Buffer.from(renderFrame(spec, 0).pixels).equals(Buffer.from(renderFrame(spec, 8).pixels))).toBe(false); // moved
    expect(Buffer.from(renderFrame(spec, 4).pixels).equals(Buffer.from(renderFrame(spec, 4).pixels))).toBe(true); // deterministic
  });
});
