import { PREFIX } from "./config.js";

/**
 * Create a per-entry timeout signal that aborts with a descriptive error when
 * the timeout fires. Combines with the parent request signal via
 * `AbortSignal.any` so async work aborts on whichever comes first.
 *
 * Returns the combined signal and a cleanup function that must be called when
 * the work finishes (success, error, or stream) to prevent the timer from
 * keeping the process alive.
 */
export function createTimeoutSignal(
  timeoutMs: number | undefined,
  requestSignal: AbortSignal | undefined,
  id: string,
): { signal: AbortSignal; cleanup: () => void } {
  const ms = timeoutMs;
  if (ms == null) {
    const signal = requestSignal ?? new AbortController().signal;
    return { signal, cleanup: () => {} };
  }

  const timer = new AbortController();
  const tid = setTimeout(
    () =>
      timer.abort(
        new Error(
          `${PREFIX} Fragment "${id}" timed out after ${ms}ms — its content did not finish in time. ` +
            "Increase the timeout (the fragment's timeout prop or defaultTimeout), or make the " +
            "content finish faster, e.g. by forwarding the abort signal to fetch().",
        ),
      ),
    ms,
  );

  const combined = requestSignal ? AbortSignal.any([requestSignal, timer.signal]) : timer.signal;

  return {
    signal: combined,
    cleanup: () => clearTimeout(tid),
  };
}
