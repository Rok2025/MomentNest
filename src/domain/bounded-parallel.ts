export async function mapBounded<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw Error('INVALID_CONCURRENCY_LIMIT');
  const values: R[] = new Array(items.length);
  let next = 0, failure: unknown;
  async function worker() {
    while (failure === undefined) {
      const index = next++;
      if (index >= items.length) return;
      try { values[index] = await run(items[index]); }
      catch (error) { failure = error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure !== undefined) throw failure;
  return values;
}
