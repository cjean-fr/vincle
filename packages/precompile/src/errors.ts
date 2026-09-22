/**
 * Stable codes on the errors this package throws. See
 * `@vincle/core`'s `errors.ts` for why they are codes on plain `Error`s rather
 * than a class hierarchy: nobody catches one to recover, and what `code` adds is
 * telling a refusal from this package apart from a fault in the caller's.
 *
 * These are API: the set may grow, an existing code may not be renamed.
 *
 * @module
 */

export const ERR_PRECOMPILE_CONFIG = "ERR_VINCLE_PRECOMPILE_CONFIG";
export const ERR_PRECOMPILE_HELPER = "ERR_VINCLE_PRECOMPILE_HELPER";
export const ERR_PRECOMPILE_INTERNAL = "ERR_VINCLE_PRECOMPILE_INTERNAL";

/** Every code this package attaches. Widening it is the one allowed change. */
export type ErrorCode =
  | typeof ERR_PRECOMPILE_CONFIG
  | typeof ERR_PRECOMPILE_HELPER
  | typeof ERR_PRECOMPILE_INTERNAL;

/**
 * Build an error already stamped, so a throw stays one expression.
 *
 * `Error.captureStackTrace` drops this frame, which keeps the throw site at the
 * top of the trace: the reason a factory can replace stamping the error at the
 * call site. It is not standard (V8's, implemented by JSC too); a runtime
 * without it costs one extra frame, not a crash.
 *
 * The `code` property is enumerable, like Node's own: a logger that spreads an
 * error carries the code with it, which is the point.
 */
export function vincleError(message: string, code: ErrorCode): Error {
  const error = new Error(message) as Error & { code: ErrorCode };
  error.code = code;
  Error.captureStackTrace?.(error, vincleError);
  return error;
}
