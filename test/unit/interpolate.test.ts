import { describe, it, expect } from "vitest";
import { lerp, lerpColor, sampleNumberTrack, sampleColorTrack, sampleTrack } from "../../src/index.js";
import type { Track } from "../../src/index.js";

describe("interpolate", () => {
  it("lerp interpolates linearly", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(-10, 10, 0.25)).toBe(-5);
  });

  it("lerpColor interpolates two opaque colors per-channel", () => {
    const c = lerpColor({ r: 255, g: 0, b: 0, a: 1 }, { r: 0, g: 0, b: 255, a: 1 }, 0.5);
    expect(c).toEqual({ r: 128, g: 0, b: 128, a: 1 });
  });

  it("lerpColor uses premultiplied alpha so fades from transparent don't darken the hue", () => {
    // transparent -> opaque red at 0.5 should be half-opaque RED, not dark red.
    const c = lerpColor({ r: 0, g: 0, b: 0, a: 0 }, { r: 255, g: 100, b: 50, a: 1 }, 0.5);
    expect(c).toEqual({ r: 255, g: 100, b: 50, a: 0.5 });
    // opaque red -> transparent at 0.5 keeps red, just halves alpha.
    expect(lerpColor({ r: 255, g: 0, b: 0, a: 1 }, { r: 0, g: 0, b: 0, a: 0 }, 0.5)).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
  });

  it("lerpColor collapses to transparent black when alpha reaches 0", () => {
    expect(lerpColor({ r: 255, g: 0, b: 0, a: 0 }, { r: 0, g: 255, b: 0, a: 0 }, 0.5)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  describe("sampleNumberTrack", () => {
    const track: Track = {
      property: "x",
      keyframes: [
        { t: 0, value: 0 },
        { t: 1, value: 100 },
        { t: 2, value: 50 },
      ],
    };

    it("holds the first value before the range", () => {
      expect(sampleNumberTrack(track, -5)).toBe(0);
    });

    it("holds the last value after the range", () => {
      expect(sampleNumberTrack(track, 99)).toBe(50);
    });

    it("interpolates linearly within a segment", () => {
      expect(sampleNumberTrack(track, 0.5)).toBe(50);
      expect(sampleNumberTrack(track, 1.5)).toBe(75);
    });

    it("hits keyframe values exactly at keyframe times", () => {
      expect(sampleNumberTrack(track, 0)).toBe(0);
      expect(sampleNumberTrack(track, 1)).toBe(100);
      expect(sampleNumberTrack(track, 2)).toBe(50);
    });

    it("applies the easing of the segment's end keyframe", () => {
      const eased: Track = {
        property: "x",
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: 100, easing: "easeInQuad" },
        ],
      };
      // easeInQuad(0.5) = 0.25 -> value 25
      expect(sampleNumberTrack(eased, 0.5)).toBeCloseTo(25, 6);
    });

    it("single-keyframe track returns a constant", () => {
      const single: Track = { property: "x", keyframes: [{ t: 3, value: 7 }] };
      expect(sampleNumberTrack(single, 0)).toBe(7);
      expect(sampleNumberTrack(single, 10)).toBe(7);
    });
  });

  describe("sampleColorTrack", () => {
    const track: Track = {
      property: "fill",
      keyframes: [
        { t: 0, value: "#000000" },
        { t: 1, value: "#ffffff" },
      ],
    };

    it("interpolates colors and returns a canvas-ready string", () => {
      expect(sampleColorTrack(track, 0.5)).toBe("rgba(128, 128, 128, 1)");
    });

    it("holds endpoints as their raw strings", () => {
      expect(sampleColorTrack(track, -1)).toBe("#000000");
      expect(sampleColorTrack(track, 5)).toBe("#ffffff");
    });
  });

  it("sampleTrack dispatches by kind", () => {
    const num: Track = {
      property: "x",
      keyframes: [
        { t: 0, value: 0 },
        { t: 1, value: 10 },
      ],
    };
    const col: Track = {
      property: "fill",
      keyframes: [
        { t: 0, value: "#000" },
        { t: 1, value: "#fff" },
      ],
    };
    expect(sampleTrack(num, 0.5, "number")).toBe(5);
    expect(sampleTrack(col, 0.5, "color")).toBe("rgba(128, 128, 128, 1)");
  });
});
