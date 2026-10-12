/** Bound active work and drain started operations before propagating failures. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  maxConcurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i]!);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const pool = Math.min(Math.max(1, Math.floor(maxConcurrency)), items.length) || 1;
  const settled = await Promise.allSettled(Array.from({ length: pool }, worker));
  const rejection = settled.find((result) => result.status === "rejected");
  if (rejection?.status === "rejected") throw rejection.reason;
  return results;
}
