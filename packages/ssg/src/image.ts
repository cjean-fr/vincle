/**
 * Image generation for sites built with `@vincle/ssg`.
 *
 * `images()` turns declared descriptors plus a project-provided converter into an
 * ordinary asset integration; `imageUrl()` is the single source of truth for the public
 * URL of one generated variant; `<Picture>` renders a declared descriptor as a
 * `<picture>` whose `src`, `srcset` and `type` all come from that same source.
 */
export { images } from "./image/integration.js";
export { imageUrl } from "./image/url.js";
export { Picture } from "./image/picture.js";
export { setImages } from "./image/scope.js";
export { ERR_VINCLE_IMAGE_INVALID, ERR_VINCLE_IMAGE_UNDECLARED } from "./image/errors.js";
export type { PictureProps } from "./image/picture.js";
export type { ImageDescriptor, ImageSource, ImageConverter, ImageOptions } from "./image/types.js";
