import type { ImageDescriptor } from "./types.js";

type VariantOwner = Pick<ImageDescriptor, "directory" | "name">;

/**
 * Output path of one variant, relative to the integration's output directory.
 * Internal to the module: {@link imageUrl} is the public form of the same path.
 */
export function variantPath(descriptor: VariantOwner, width: number, format: string): string {
  return `${descriptor.directory}/${descriptor.name}-${width}.${format}`;
}

/**
 * Public URL of one variant: "/directory/name-width.format", for example
 * "/portraits/photo-256.avif".
 *
 * The single source of truth for variant paths: the generator derives the file path
 * from it and render components build `src`/`srcset` entries from it, so markup and
 * files cannot diverge.
 *
 * - absolute from the site root, leading slash included, **without** `base`: render
 *   components prefix the configured base themselves;
 * - no encoding: `directory`, `name` and `format` are validated by {@link images},
 *   so no character present needs `encodeURIComponent`;
 * - no query, fragment or hash: variants are immutable within a build;
 * - pure: no validation, no filesystem access, never throws. Its inputs are already
 *   validated by {@link images} (and, in render components, come from the registry).
 *
 * @param descriptor Directory and name of the image; other fields are ignored.
 * @param width Variant width, in pixels.
 * @param format Variant format, one of the descriptor's `formats`.
 */
export function imageUrl(descriptor: VariantOwner, width: number, format: string): string {
  return `/${variantPath(descriptor, width, format)}`;
}
