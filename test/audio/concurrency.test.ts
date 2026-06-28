import { describe, it, expect } from "vitest";
import { mapLimit } from "../../src/audio/concurrency.js";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("mapLimit", () => {
  it("preserves input order even when later items finish first", async () => {
    const items = [0, 1, 2, 3, 4];
    // delay = (length - i) ms, so item 0 finishes last yet must land first in output.
    const out = await mapLimit(items, 2, async (item, i) => {
      await sleep(items.length - i);
      return item * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40]);
  });

  it("never exceeds the concurrency limit", async () => {
    const items = [0, 1, 2, 3, 4, 5];
    const limit = 2;
    let live = 0;
    let maxLive = 0;
    const out = await mapLimit(items, limit, async (item) => {
      live++;
      maxLive = Math.max(maxLive, live);
      await sleep(2);
      live--;
      return item;
    });
    expect(out).toEqual(items);
    expect(maxLive).toBeLessThanOrEqual(limit);
  });

  it("clamps limit to at least 1 (runs serially)", async () => {
    let live = 0;
    let maxLive = 0;
    const out = await mapLimit([1, 2, 3], 0, async (item) => {
      live++;
      maxLive = Math.max(maxLive, live);
      await sleep(1);
      live--;
      return item;
    });
    expect(out).toEqual([1, 2, 3]);
    expect(maxLive).toBe(1);
  });

  it("returns [] for empty input without calling fn", async () => {
    let calls = 0;
    const out = await mapLimit([], 4, async (x) => {
      calls++;
      return x;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("rejects when any fn rejects", async () => {
    await expect(
      mapLimit([1, 2, 3, 4], 2, async (item) => {
        await sleep(1);
        if (item === 3) throw new Error("boom");
        return item;
      }),
    ).rejects.toThrow("boom");
  });

  it("stops claiming new work after a failure", async () => {
    const started: number[] = [];
    await expect(
      mapLimit([0, 1, 2, 3, 4, 5], 1, async (item) => {
        started.push(item);
        await sleep(1);
        if (item === 1) throw new Error("stop");
        return item;
      }),
    ).rejects.toThrow("stop");
    // Serial worker fails at index 1, so it must never have started index 2+.
    expect(started).toEqual([0, 1]);
  });
});
