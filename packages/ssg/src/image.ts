/**
 * Image generation for sites built with `@vincle/ssg`.
 *
 * `images()` turns declared descriptors plus a project-provided converter into an
 * ordinary asset integration; `imageUrl()` is the single source of truth for the public
 * URL of one generated variant.
 */
export { images } from "./image/integration.js";
export { imageUrl } from "./image/url.js";
export type { ImageDescriptor, ImageSource, ImageConverter, ImageOptions } from "./image/types.js";
