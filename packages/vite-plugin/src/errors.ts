/**
 * Stable codes on the errors this package throws. See
 * `@vincle/core`'s `errors.ts` for why they are codes on plain `Error`s rather
 * than a class hierarchy: nobody catches one to recover, and what `code` adds is
 * telling a refusal from this package apart from a fault in the caller's.
 *
 * These are API — the set may grow, an existing code may not be renamed.
 *
 * @module
 */

export const ERR_VITE_MANIFEST_READ = "ERR_VINCLE_VITE_MANIFEST_READ";
export const ERR_VITE_MANIFEST_PARSE = "ERR_VINCLE_VITE_MANIFEST_PARSE";
export const ERR_VITE_MANIFEST_SHAPE = "ERR_VINCLE_VITE_MANIFEST_SHAPE";
export const ERR_VITE_CONFIG = "ERR_VINCLE_VITE_CONFIG";
export const ERR_VITE_MISSING_ENTRY = "ERR_VINCLE_VITE_MISSING_ENTRY";

/** Every code this package attaches. Widening it is the one allowed change. */
export type ErrorCode =
  | typeof ERR_VITE_MANIFEST_READ
  | typeof ERR_VITE_MANIFEST_PARSE
  | typeof ERR_VITE_MANIFEST_SHAPE
  | typeof ERR_VITE_CONFIG
  | typeof ERR_VITE_MISSING_ENTRY;

/**
 * Build an error already stamped, so a throw stays one expression.
 *
 * `Error.captureStackTrace` drops this frame, which keeps the throw site at the
 * top of the trace — the reason a factory can replace stamping the error at the
 * call site. It is not standard (V8's, implemented by JSC too); a runtime
 * without it costs one extra frame, not a crash.
 *
 * The `code` property is enumerable, like Node's own — a logger that spreads an
 * error carries the code with it, which is the point.
 *
 * `options` carries a `cause`: this package is the one that wraps a foreign
 * failure — a read or a parse the platform refused — and the code names our
 * refusal while the cause keeps theirs, `ENOENT` and its stack included.
 */
export function vincleError(message: string, code: ErrorCode, options?: ErrorOptions): Error {
  const error = new Error(message, options) as Error & { code: ErrorCode };
  error.code = code;
  Error.captureStackTrace?.(error, vincleError);
  return error;
}
