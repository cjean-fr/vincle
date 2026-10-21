import type { ImageDescriptor } from "./types.js";

/**
 * MIME types for the formats this module knows. `jpg` and `jpeg` share one type, as
 * do the browsers: a variant keeps the extension its descriptor declared and the type
 * a browser needs to pick a `<source>`.
 */
const MIME: Readonly<Record<string, string>> = {
  avif: "image/avif",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  jxl: "image/jxl",
};

/**
 * MIME type of one variant format: the descriptor's {@link ImageDescriptor.mime}
 * override first, this module's table second.
 *
 * `undefined` when neither knows the format, which is how render components omit the
 * `type` attribute: a `<source>` without a type still works, a wrong one is skipped by
 * the browser. Never throws, never validates: the override table is checked by
 * {@link images}.
 */
export function mimeType(format: string, descriptor: ImageDescriptor): string | undefined {
  return descriptor.mime?.[format] ?? MIME[format];
}
