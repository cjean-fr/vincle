/**
 * Create a per-entry timeout signal that aborts with a descriptive error when
 * the timeout fires. Combines with the parent request signal via
 * `AbortSignal.any` so the factory aborts on whichever comes first.
 *
 * Returns the combined signal and a cleanup function that must be called when
 * the deferred work finishes (success, error, or stream) to prevent the timer
 * from keeping the process alive.
 */
export function createTimeoutSignal(
  timeoutMs: number | undefined,
  requestSignal: AbortSignal | undefined,
  id: string,
): { factorySignal: AbortSignal; cleanup: () => void } {
  const ms = timeoutMs;
  if (ms == null) {
    const signal = requestSignal ?? new AbortController().signal;
    return { factorySignal: signal, cleanup: () => {} };
  }

  const timer = new AbortController();
  const tid = setTimeout(
    () => timer.abort(new Error(`Template "${id}" timed out after ${ms}ms`)),
    ms,
  );

  const factorySignal =
    requestSignal && timer
      ? AbortSignal.any([requestSignal, timer.signal])
      : (requestSignal ?? timer.signal);

  return {
    factorySignal,
    cleanup: () => clearTimeout(tid),
  };
}
