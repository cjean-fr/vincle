/**
 * Generic stream lifecycle factory — encapsulates backpressure, cancellation,
 * and `ReadableStream` mechanics so callers focus on producing events.
 *
 * - `pull()` releases any producer parked on backpressure.
 * - `cancel(reason)` and `opts.signal` both feed one combined `AbortSignal`,
 *   which stops the producer and releases any parked `emit()` call.
 */
export function createFlowStream<T>(
  producer: (
    emit: (t: T) => Promise<void>,
    signal: AbortSignal,
  ) => Promise<void>,
  opts?: { signal?: AbortSignal },
): ReadableStream<T> {
  const internal = new AbortController();
  const signal = opts?.signal
    ? AbortSignal.any([opts.signal, internal.signal])
    : internal.signal;
  let controller!: ReadableStreamDefaultController<T>;
  const waiters: Array<() => void> = [];
  const flushWaiters = () => {
    for (const r of waiters.splice(0)) r();
  };
  signal.addEventListener("abort", flushWaiters, { once: true });

  const emit = async (ev: T) => {
    if (signal.aborted) return;
    while ((controller.desiredSize ?? 1) <= 0 && !signal.aborted)
      await new Promise<void>((r) => waiters.push(r));
    if (!signal.aborted) controller.enqueue(ev);
  };

  return new ReadableStream<T>({
    start(c) {
      controller = c;
      producer(emit, signal).then(
        () => {
          try {
            c.close();
          } catch {}
        },
        (e) => {
          try {
            c.error(e);
          } catch {}
        },
      );
    },
    pull() {
      flushWaiters();
    },
    cancel(reason) {
      internal.abort(reason);
    },
  });
}
