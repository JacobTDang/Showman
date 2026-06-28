/**
 * Tiny bounded-concurrency map — runs an async `fn` over many items while keeping at
 * most `limit` in flight. Used to synthesize narration segments in parallel without
 * exceeding a worker/rate budget, while still returning results in input order.
 */

/**
 * Map `fn` over `items` with at most `limit` calls in flight at once.
 *
 * Results are returned IN INPUT ORDER (`out[i]` corresponds to `items[i]`), regardless
 * of which task settles first. `limit` is clamped to >= 1. Empty input resolves to `[]`.
 * If any `fn` rejects, the returned promise rejects with that error (already-running
 * tasks may still settle, but the overall result rejects and no new tasks are started).
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const n = items.length;
  if (n === 0) return [];
  const workers = Math.min(Math.max(1, Math.floor(limit) || 1), n);
  const out = new Array<R>(n);
  let next = 0; // shared cursor: index of the next item to claim
  let failed = false;

  const run = async (): Promise<void> => {
    while (next < n && !failed) {
      const i = next++;
      try {
        out[i] = await fn(items[i]!, i);
      } catch (err) {
        failed = true; // stop claiming new work; surface the first failure
        throw err;
      }
    }
  };

  await Promise.all(Array.from({ length: workers }, () => run()));
  return out;
}
