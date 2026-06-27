import { describe, it, expect } from "vitest";
import { makeRng, hashSeed } from "../../src/index.js";

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different streams for different seeds", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("next() stays within [0, 1)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() is inclusive on both ends and within range", () => {
    const r = makeRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([3, 4, 5, 6]));
  });

  it("float() respects bounds", () => {
    const r = makeRng(5);
    for (let i = 0; i < 1000; i++) {
      const v = r.float(-2, 2);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(2);
    }
  });

  it("pick() chooses from the array and throws on empty", () => {
    const r = makeRng(11);
    const items = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) expect(items).toContain(r.pick(items));
    expect(() => r.pick([])).toThrow();
  });

  it("fork() yields independent but reproducible streams", () => {
    const base = makeRng(123);
    const f1a = base.fork(1);
    const f1b = makeRng(123).fork(1);
    const f2 = base.fork(2);
    expect(f1a.next()).toBe(f1b.next()); // reproducible
    expect(makeRng(123).fork(1).next()).not.toBe(makeRng(123).fork(2).next()); // independent
    expect(typeof f2.next()).toBe("number");
  });

  it("hashSeed is stable and order-sensitive", () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3));
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
    expect(hashSeed(0)).toBeTypeOf("number");
  });
});
