import { Scope, type ScopeKey } from "@vincle/core";

import type { ImageDescriptor } from "./types.js";

import { basePath } from "../base.js";

/**
 * What a render sees of the image configuration: the declared descriptors, by id, and
 * the public base every generated URL is prefixed with.
 *
 * Built once per render scope by the `render` of {@link images}, or by
 * {@link setImages} in tests. Nothing is stored at module level, so no descriptor
 * survives the render that saw it.
 */
export interface ImageScopeValue {
  /** Descriptors by id, exactly as declared in images(). */
  descriptors: Map<string, ImageDescriptor>;
  /** Public base, normalized: "/" or "/docs/". */
  base: string;
}

/** The one key render components read; declared once, at module level. */
const IMAGE_SCOPE: ScopeKey<ImageScopeValue> = Scope.key<ImageScopeValue>("@vincle/ssg:image");

/**
 * Install the image registry for the current render scope.
 *
 * The `render` of {@link images} calls this for every page, so a project only calls it
 * by hand in tests, where no integration is prepared. It must run inside a scope, like
 * `setVite`: `Scope.set` throws the core `ERR_NO_SCOPE` outside one, and that error is
 * not masked here.
 *
 * `null` (or an empty list) installs an empty registry rather than clearing the key: a
 * page without `<Picture>` renders fine, and one with it fails as undeclared instead of
 * as "no registry".
 *
 * @param descriptors Descriptors to expose, or `null` for none.
 * @param options.base Public path prefix, normalized to `"/"` or `"/docs/"`; default `"/"`.
 */
export function setImages(
  descriptors: readonly ImageDescriptor[] | null,
  options?: { base?: string },
): void {
  Scope.set(IMAGE_SCOPE, {
    descriptors: new Map((descriptors ?? []).map((descriptor) => [descriptor.id, descriptor])),
    base: basePath(options?.base ?? "/") ?? "/",
  });
}

/**
 * The registry installed earlier in this scope.
 *
 * Internal: render components read it through this, and it throws the core
 * `ERR_NO_SCOPE` / `ERR_CONTEXT_UNSET` errors outside a scope or before installation,
 * which `<Picture>` translates into its own undeclared error.
 */
export function getImageScope(): ImageScopeValue {
  return Scope.get(IMAGE_SCOPE);
}
