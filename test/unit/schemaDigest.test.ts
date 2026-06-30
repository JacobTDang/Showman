import { describe, it, expect } from "vitest";
import { describeScene, describeSceneCompact } from "../../src/index.js";
import { NODE_TYPES, REGISTERED_FONT_FAMILIES, EASING_NAMES, LIMITS } from "../../src/spec/schema.js";

describe("compact schema digest (efficiency for a 120B model)", () => {
  const digest = describeSceneCompact();
  const full = JSON.stringify(describeScene());

  it("is dramatically smaller than the full schema JSON", () => {
    // The whole point: stop dumping 8–15 KB of schema on every attempt.
    expect(digest.length).toBeLessThan(full.length * 0.5);
  });

  it("still names every node type", () => {
    for (const t of NODE_TYPES) expect(digest).toContain(t);
  });

  it("lists every pinned font and at least the common easings", () => {
    for (const f of REGISTERED_FONT_FAMILIES) expect(digest).toContain(f);
    for (const e of EASING_NAMES) expect(digest).toContain(e);
  });

  it("states the key engine limits the model must respect", () => {
    expect(digest).toContain(String(LIMITS.maxFrames));
    expect(digest).toContain(String(LIMITS.maxNodes));
    expect(digest).toContain(String(LIMITS.maxFps));
  });

  it("flags required keys (e.g. polyline points, text text) with an asterisk", () => {
    expect(digest).toMatch(/points\*/);
    expect(digest).toMatch(/text\*/);
    expect(digest).toMatch(/children\*/);
  });

  it("is stable across calls (cached, registry-driven)", () => {
    expect(describeSceneCompact()).toBe(digest);
  });
});
