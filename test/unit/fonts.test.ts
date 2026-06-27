import { describe, it, expect } from "vitest";
import { ensureFontsRegistered, isRegisteredFamily, REGISTERED_FONT_FAMILIES, DEFAULT_FONT_FAMILY } from "../../src/index.js";

describe("fonts", () => {
  it("registers the pinned fonts without throwing (and is idempotent)", () => {
    expect(() => {
      ensureFontsRegistered();
      ensureFontsRegistered();
    }).not.toThrow();
  });

  it("recognizes the pinned family and rejects unregistered ones", () => {
    expect(isRegisteredFamily(DEFAULT_FONT_FAMILY)).toBe(true);
    expect(isRegisteredFamily("Nunito")).toBe(true);
    expect(isRegisteredFamily("Arial")).toBe(false);
    expect(isRegisteredFamily("Comic Sans MS")).toBe(false);
  });

  it("default family is part of the registered set", () => {
    expect(REGISTERED_FONT_FAMILIES).toContain(DEFAULT_FONT_FAMILY);
  });
});
