import type { ImageSource } from "./types.js";

/** One decoded master and every variant encoded from its current filesystem state. */
interface ImageCacheEntry {
  /** Source state the entry was decoded from: `${mtimeMs}:${size}`. */
  key: string;
  /** Decoded master, as returned by the converter. */
  image: ImageSource;
  /** Encoded variants, keyed by `${width}:${format}`. */
  variants: Map<string, Uint8Array>;
}

/**
 * Preparation memo of one configuration: absolute master path to decoded state.
 * Variants no longer referenced by the configuration stay until the source changes;
 * they are bounded by the configuration and never observable.
 */
export interface ImageCache {
  entries: Map<string, ImageCacheEntry>;
}

/** Create the memo owned by one {@link images} call; never shared at module scope. */
export function createImageCache(): ImageCache {
  return { entries: new Map() };
}
