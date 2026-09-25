/**
 * Stable codes on the errors this package throws.
 *
 * Every one of them is a programmer error: an invalid tag name, content inside
 * a void element, a context read outside its scope. Nobody catches one to
 * recover, so they stay plain `Error`s and `TypeError`s rather than a class
 * hierarchy nothing would interrogate.
 *
 * What `code` adds is the one thing the type does not carry. `TypeError` is also
 * what a component throws when it has a bug of its own, and `@vincle/flow`
 * formats `name: message` into `onError`, where a refusal from this package and
 * a fault in the caller's code are otherwise told apart by looking for a prefix
 * in a message. `code` is that discrimination without string matching.
 *
 * The convention is Node's: an own `code` property holding a stable string.
 * These are API: the set may grow, an existing code may not be renamed.
 *
 * @module
 */

export const ERR_INVALID_TAG = "ERR_VINCLE_INVALID_TAG";
export const ERR_VOID_CHILDREN = "ERR_VINCLE_VOID_CHILDREN";
export const ERR_DANGEROUS_HTML = "ERR_VINCLE_DANGEROUS_HTML";
export const ERR_FUNCTION_ATTR = "ERR_VINCLE_FUNCTION_ATTR";
export const ERR_ANIMATED_HANDLER = "ERR_VINCLE_ANIMATED_HANDLER";
export const ERR_VNODE_AS_TEXT = "ERR_VINCLE_VNODE_AS_TEXT";

export const ERR_SCOPE_COLLISION = "ERR_VINCLE_SCOPE_COLLISION";
export const ERR_NO_STORE = "ERR_VINCLE_NO_STORE";
export const ERR_NO_SCOPE = "ERR_VINCLE_NO_SCOPE";
export const ERR_CONTEXT_KEY = "ERR_VINCLE_CONTEXT_KEY";
export const ERR_CONTEXT_LIMIT = "ERR_VINCLE_CONTEXT_LIMIT";
export const ERR_CONTEXT_UNSET = "ERR_VINCLE_CONTEXT_UNSET";
export const ERR_CONTEXT_CHILDREN = "ERR_VINCLE_CONTEXT_CHILDREN";

/**
 * Codes raised as `Error`: a state or a value the renderer cannot use.
 * Widening either union is the one allowed change.
 */
export type ErrorCode =
  | typeof ERR_FUNCTION_ATTR
  | typeof ERR_ANIMATED_HANDLER
  | typeof ERR_VNODE_AS_TEXT
  | typeof ERR_SCOPE_COLLISION
  | typeof ERR_NO_STORE
  | typeof ERR_NO_SCOPE
  | typeof ERR_CONTEXT_KEY
  | typeof ERR_CONTEXT_LIMIT
  | typeof ERR_CONTEXT_UNSET
  | typeof ERR_CONTEXT_CHILDREN;

/** Codes raised as `TypeError`: an argument that is not what it has to be. */
export type TypeErrorCode =
  | typeof ERR_INVALID_TAG
  | typeof ERR_VOID_CHILDREN
  | typeof ERR_DANGEROUS_HTML;

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

/** The same, for the codes raised as `TypeError`. */
export function vincleTypeError(message: string, code: TypeErrorCode): TypeError {
  const error = new TypeError(message) as TypeError & { code: TypeErrorCode };
  error.code = code;
  Error.captureStackTrace?.(error, vincleTypeError);
  return error;
}

/**
 * The tail of the errors raised on a runtime without `AsyncLocalStorage`: the
 * runtimes that have it, and the page that documents the fallback. One
 * constant so the runtime list cannot drift between the messages.
 */
export function noAlsHint(consequence: string): string {
  return (
    "Enable it (Node ≥16, Bun, Deno ≥1.11, or Cloudflare Workers with `nodejs_compat`): " +
    consequence +
    ". See https://vincle.cjean.fr/api/core/scope"
  );
}
