/**
 * Image generation contracts: the project supplies the codec, the module derives
 * every output path from validated configuration.
 */

/**
 * One declared image: a source master, a public directory and the variants to encode.
 *
 * Descriptors are read again on every preparation and are never copied, so do not
 * mutate one after passing it to {@link images}: the generator and, later, the render
 * components share the same objects. Configuration is trusted project code.
 */
export interface ImageDescriptor {
  /** Unique id within one {@link images} call; render components resolve images by id. */
  id: string;
  /** Source master, relative to the project root in configuration; resolved by prepare(). */
  source: string;
  /**
   * Public directory receiving the variants, for example "portraits". A relative path
   * with forward slashes; nesting such as "img/portraits" is allowed.
   */
  directory: string;
  /** File name prefix, for example "photo"; a single segment, without a slash. */
  name: string;
  /** Positive integer widths; one width yields one file per format. */
  widths: readonly number[];
  /**
   * Encodable formats, a subset of `converter.formats`; the last one is the `<img>`
   * fallback format of the render components.
   */
  formats: readonly string[];
  /**
   * MIME override per format, for example `{ tiff: "image/tiff" }`, consulted before
   * the module's own table when a render component writes a `<source type>`. Keys must
   * be declared in {@link formats} and values non-empty strings. A format in neither
   * the override nor the table emits no `type` rather than a guessed one.
   */
  mime?: Readonly<Record<string, string>>;
}

/**
 * Decoded master owned by the converter. This module only reads `width` and `height`
 * to validate the shape, then hands the same object back to `encode`.
 */
export interface ImageSource {
  readonly width: number;
  readonly height: number;
}

/**
 * Image codec provided by the project, for example a `sharp` or WASM wrapper. It is
 * not sandboxed: it runs in the build process with the project's privileges.
 */
export interface ImageConverter {
  /** Encodable extensions, for example ["avif", "webp", "jpg"]. */
  readonly formats: readonly string[];
  /** Decode a master; called once per state of the source file and cached by the module. */
  decode(source: string): Promise<ImageSource>;
  /** Encode one variant; called once per variant and per state of the source file. */
  encode(
    image: ImageSource,
    variant: { readonly width: number; readonly format: string },
  ): Promise<Uint8Array>;
}

/** Configuration of {@link images}. */
export interface ImageOptions {
  /** Codec performing the actual decoding and encoding. */
  converter: ImageConverter;
  /** Images to generate; an empty list prepares an empty directory. */
  descriptors: readonly ImageDescriptor[];
}
