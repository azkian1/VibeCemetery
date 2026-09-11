// Do not return while another worker can still mutate a checkpoint or consume requests.
export async function mapBounded<T>(items: readonly T[], concurrency: number, work: (item: T) => Promise<void>): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('invalid_concurrency');
  let next = 0, failed = false;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try { await work(item); } catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }));
  if (failed) throw failure;
}
