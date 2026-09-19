/**
 * Stable codes on the errors this package throws.
 *
 * Same reasoning as `@vincle/core`'s: these are programmer errors nobody catches
 * to recover from, so they stay plain `Error`s rather than a class hierarchy.
 * What `code` adds is the discrimination the type cannot carry — `onError`
 * receives whatever a fragment threw, and a refusal from flow has to be tellable
 * from a fault in the component without matching a prefix in a message.
 *
 * These are API — the set may grow, an existing code may not be renamed.
 *
 * @module
 */

export const ERR_FLOW_CONFIG = "ERR_VINCLE_FLOW_CONFIG";
export const ERR_FLOW_NO_ADAPTER = "ERR_VINCLE_FLOW_NO_ADAPTER";
export const ERR_FLOW_MERGE_UNSUPPORTED = "ERR_VINCLE_FLOW_MERGE_UNSUPPORTED";
export const ERR_FLOW_FRAGMENT_ID = "ERR_VINCLE_FLOW_FRAGMENT_ID";
export const ERR_FLOW_NO_FRAGMENT = "ERR_VINCLE_FLOW_NO_FRAGMENT";
export const ERR_FLOW_NO_STREAMING = "ERR_VINCLE_FLOW_NO_STREAMING";
export const ERR_FLOW_FORBIDDEN_SCHEME = "ERR_VINCLE_FLOW_FORBIDDEN_SCHEME";
export const ERR_FLOW_DUP_FRAGMENT = "ERR_VINCLE_FLOW_DUP_FRAGMENT";

/** Every code this package attaches. Widening it is the one allowed change. */
export type ErrorCode =
  | typeof ERR_FLOW_CONFIG
  | typeof ERR_FLOW_NO_ADAPTER
  | typeof ERR_FLOW_MERGE_UNSUPPORTED
  | typeof ERR_FLOW_FRAGMENT_ID
  | typeof ERR_FLOW_NO_FRAGMENT
  | typeof ERR_FLOW_NO_STREAMING
  | typeof ERR_FLOW_FORBIDDEN_SCHEME
  | typeof ERR_FLOW_DUP_FRAGMENT;

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
 */
export function vincleError(message: string, code: ErrorCode): Error {
  const error = new Error(message) as Error & { code: ErrorCode };
  error.code = code;
  Error.captureStackTrace?.(error, vincleError);
  return error;
}
