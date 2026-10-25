import type { ImageDescriptor } from "./types.js";

/**
 * Stable codes on the errors raised while rendering images. See `@vincle/core`'s
 * `errors.ts` for why they are codes on plain `Error`s rather than a class hierarchy:
 * nobody catches one to recover, and what `code` adds is telling a refusal from this
 * package apart from a fault in the caller's code.
 *
 * Every one of them is a build error: an image that is not declared, or a width that
 * was never generated, fails the build instead of shipping a 404.
 *
 * These are API: the set may grow, an existing code may not be renamed.
 *
 * @module
 */

/** No registry in this scope, or no descriptor with that id in it; the build stops. */
export const ERR_VINCLE_IMAGE_UNDECLARED = "ERR_VINCLE_IMAGE_UNDECLARED";
/** The descriptor is declared, but a prop asks for a variant it never declared. */
export const ERR_VINCLE_IMAGE_INVALID = "ERR_VINCLE_IMAGE_INVALID";

/** Every code this module attaches. Widening it is the one allowed change. */
type ErrorCode = typeof ERR_VINCLE_IMAGE_UNDECLARED | typeof ERR_VINCLE_IMAGE_INVALID;

/**
 * Core scope codes that mean "no registry" for render components.
 *
 * `@vincle/core` raises them but does not re-export the constants, so they are repeated
 * here as strings: an existing code is never renamed, and a test pins both.
 */
const ERR_NO_SCOPE = "ERR_VINCLE_NO_SCOPE";
const ERR_CONTEXT_UNSET = "ERR_VINCLE_CONTEXT_UNSET";

/**
 * True when `Scope.get` failed because no registry could be read at all.
 *
 * `Scope.get` raises exactly these two codes: `ERR_NO_SCOPE` outside any scope, and
 * `ERR_CONTEXT_UNSET` when the scope exists but never installed the key. `ERR_NO_STORE`
 * cannot reach a reader: `scopeContext` folds an uninitialized store into
 * `ERR_NO_SCOPE` (packages/core/src/scope.ts:114-124). Anything else is a fault in this
 * package or in the core, and `<Picture>` rethrows it untouched.
 */
export function isMissingRegistry(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { code } = error as Error & { code?: unknown };
  return code === ERR_NO_SCOPE || code === ERR_CONTEXT_UNSET;
}

const PREFIX = "[vincle/ssg/image] ";

/**
 * Build an error already stamped, so a throw stays one expression. Same shape as
 * `@vincle/vite-plugin`'s, for the same reason: the code, not a message prefix, is what
 * a logger or a tool classifies.
 */
function vincleError(message: string, code: ErrorCode): Error {
  const error = new Error(message) as Error & { code: ErrorCode };
  error.code = code;
  Error.captureStackTrace?.(error, vincleError);
  return error;
}

/**
 * `<Picture>` ran without a registry: no `images()` integration in the build, or a
 * test that forgot {@link setImages}. Named separately from an undeclared id because
 * the fix is a declaration, not a spelling.
 */
export function missingRegistryError(): Error {
  return vincleError(
    `${PREFIX}<Picture> was rendered without an image registry. ` +
      "Declare images(...) in the assets of ssg.config.ts, or call setImages() in tests.",
    ERR_VINCLE_IMAGE_UNDECLARED,
  );
}

/** The `image` prop carries no usable id, so no descriptor can be looked up. */
export function missingImageIdError(): Error {
  return vincleError(
    `${PREFIX}<Picture> requires an image descriptor with an id. ` +
      "Pass an object declared in images({ descriptors: [...] }).",
    ERR_VINCLE_IMAGE_UNDECLARED,
  );
}

/**
 * The id is not declared. The declared ids are listed, so a typo is visible in the
 * error: `"thumb" is not declared in images(). Declared images: portrait.`
 */
export function undeclaredImageError(id: string, declared: readonly string[]): Error {
  const known = declared.length > 0 ? [...declared].toSorted().join(", ") : "(none)";
  return vincleError(
    `${PREFIX}<Picture> image ${JSON.stringify(id)} is not declared in images(). ` +
      `Declared images: ${known}. ` +
      "Add the descriptor to images({ descriptors: [...] }) in ssg.config.ts, or call setImages() in tests.",
    ERR_VINCLE_IMAGE_UNDECLARED,
  );
}

/**
 * `fallbackWidth` names a width the descriptor does not declare, so the variant it
 * would point at is never generated. The declared widths are listed; the computed
 * default is not, since it is never the faulty value.
 */
export function unknownWidthError(descriptor: ImageDescriptor, width: number): Error {
  return vincleError(
    `${PREFIX}<Picture> image ${JSON.stringify(descriptor.id)} has no width ${width}; ` +
      `declared widths: ${descriptor.widths.join(", ")}. ` +
      "Pass fallbackWidth as one of the declared widths.",
    ERR_VINCLE_IMAGE_INVALID,
  );
}
