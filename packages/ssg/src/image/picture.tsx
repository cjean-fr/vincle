import type { JSX } from "@vincle/core";

import type { ImageDescriptor } from "./types.js";

import {
  isMissingRegistry,
  missingImageIdError,
  missingRegistryError,
  undeclaredImageError,
  unknownWidthError,
} from "./errors.js";
import { mimeType } from "./mime.js";
import { getImageScope, type ImageScopeValue } from "./scope.js";
import { imageUrl } from "./url.js";

/**
 * Props of {@link Picture}: one declared image, plus the attributes the page wants on
 * the `<img>`.
 *
 * The list is closed on purpose. An unknown prop is a type error rather than an
 * attribute silently emitted into the document, and `alt` is required: a decorative
 * image passes `""` deliberately.
 */
export interface PictureProps {
  /** Descriptor object; its `id` must be declared in images(). */
  image: ImageDescriptor;
  /** Alternative text, escaped by the runtime. */
  alt: string;
  /** `sizes` emitted on every <source> and on <img>; omitted when absent. */
  sizes?: string;
  /** Width of the <img> src; default: the largest declared width. */
  fallbackWidth?: number;
  /** Class of <img>. */
  class?: string;
  /** Class of <picture>. */
  pictureClass?: string;
  width?: number | string;
  height?: number | string;
  loading?: "eager" | "lazy";
  decoding?: "async" | "sync" | "auto";
  fetchPriority?: "high" | "low" | "auto";
}

/**
 * Render one declared image as a `<picture>`: a `<source>` per format, then the `<img>`
 * fallback.
 *
 * The descriptor consulted is the one in the registry, found by `image.id`; the object
 * a page passes only carries that id. A copy with different `widths` or `formats`
 * therefore cannot produce markup pointing at files nobody generated.
 *
 * Rendering rules:
 *
 * - the last format of `formats` is the `<img>` fallback; the others become `<source>`
 *   elements, in declaration order;
 * - every URL comes from {@link imageUrl}, prefixed with the registry base once, here:
 *   `imageUrl` never includes it;
 * - `srcset` lists every declared width, as `"<url> <width>w"`, comma-separated;
 * - `fallbackWidth` defaults to the largest declared width and must be one of them;
 * - `type` is the descriptor's MIME override or the module's table; a format neither
 *   knows emits no `type` at all;
 * - `sizes` is emitted only when the prop is passed: no implicit `100vw`.
 *
 * Every attribute goes through the JSX runtime, so `alt`, `class` and `sizes` are
 * escaped; no markup is built by concatenation here.
 *
 * @throws an `Error` coded `ERR_VINCLE_IMAGE_UNDECLARED` without a registry, without a
 * usable id, or for an undeclared id, and `ERR_VINCLE_IMAGE_INVALID` for a
 * `fallbackWidth` outside the declared widths: a broken image fails the build, it never
 * ships as a 404.
 *
 * @example
 * ```tsx
 * import { Picture } from "@vincle/ssg/image";
 * import { portrait } from "./images.ts";
 *
 * <Picture image={portrait} alt={basics.name} width={1024} height={1024} sizes="256px" />
 * ```
 */
export function Picture(props: PictureProps): JSX.Element {
  // Typed as required, but a JS caller or a spread may omit it: name that fault here,
  // before reading the registry, so the message is reachable without one, and rather
  // than crash on `undefined.id`.
  const image: ImageDescriptor | undefined = props.image;
  const id = image?.id;
  if (typeof id !== "string" || id.trim() === "") throw missingImageIdError();

  const scope = registry();
  const descriptor = scope.descriptors.get(id);
  if (descriptor === undefined) throw undeclaredImageError(id, [...scope.descriptors.keys()]);

  const formats = descriptor.formats;
  // Validation guarantees a non-empty list; the last format is the <img> fallback.
  const fallbackFormat = formats[formats.length - 1]!;
  const fallbackWidth = props.fallbackWidth ?? Math.max(...descriptor.widths);
  if (!descriptor.widths.includes(fallbackWidth))
    throw unknownWidthError(descriptor, fallbackWidth);

  // The one place the base is applied: imageUrl is already the absolute path.
  const url = (width: number, format: string): string =>
    scope.base + imageUrl(descriptor, width, format).slice(1);
  const srcset = (format: string): string =>
    descriptor.widths.map((width) => `${url(width, format)} ${width}w`).join(", ");

  return (
    <picture class={props.pictureClass}>
      {formats.slice(0, -1).map((format) => (
        <source srcset={srcset(format)} sizes={props.sizes} type={mimeType(format, descriptor)} />
      ))}
      <img
        src={url(fallbackWidth, fallbackFormat)}
        srcset={srcset(fallbackFormat)}
        sizes={props.sizes}
        alt={props.alt}
        width={props.width}
        height={props.height}
        class={props.class}
        loading={props.loading}
        fetchpriority={props.fetchPriority}
        decoding={props.decoding}
      />
    </picture>
  );
}

/**
 * The registry installed for this render scope.
 *
 * `Scope.get` raises `ERR_VINCLE_NO_SCOPE` outside any scope and `ERR_VINCLE_CONTEXT_UNSET`
 * when the scope exists but never installed a registry; for `<Picture>` both mean the
 * same thing, so both become `ERR_VINCLE_IMAGE_UNDECLARED` naming the fix. Any other
 * error, a fault in this package or in the core included, is rethrown as it is.
 */
function registry(): ImageScopeValue {
  try {
    return getImageScope();
  } catch (error) {
    if (isMissingRegistry(error)) throw missingRegistryError();
    throw error;
  }
}
