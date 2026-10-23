import type { Stats } from "node:fs";

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ImageCache } from "./cache.js";
import type { ImageConverter, ImageDescriptor, ImageSource } from "./types.js";

import { SsgError, failure } from "../errors.js";
import { variantPath } from "./url.js";

const converterHint =
  "Check the converter's decode/encode implementation and the source file; see the original cause.";
const sourceHint = "Fix the descriptor's source path: it is resolved from the project root.";
const writeHint = "Check that the asset preparation directory is writable and has free space.";

interface GenerationFailure {
  /** Absolute project root. */
  root: string;
  /** Descriptor id. */
  image: string;
  /** Declared source value, for master failures. */
  source?: string;
  /** `<width>.<format>`, for variant failures. */
  variant?: string;
}

function imageError(
  summary: string,
  hint: string,
  details: GenerationFailure,
  cause?: unknown,
): never {
  throw failure(
    summary,
    {
      reason: "ASSETS_FAILED",
      hint,
      context: {
        root: details.root,
        phase: "assets",
        image: details.image,
        ...(details.source === undefined ? {} : { source: details.source }),
        ...(details.variant === undefined ? {} : { variant: details.variant }),
      },
    },
    cause,
  );
}

/** Inspect the master without reading it: the converter opens the source itself. */
async function inspectSource(
  absolute: string,
  descriptor: ImageDescriptor,
  root: string,
): Promise<Stats> {
  try {
    const info = await stat(absolute);
    if (!info.isFile())
      imageError(`Image source is not a file: ${descriptor.source}`, sourceHint, {
        root,
        image: descriptor.id,
        source: descriptor.source,
      });
    return info;
  } catch (error) {
    if (error instanceof SsgError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      imageError(
        `Image source not found: ${descriptor.source}`,
        sourceHint,
        { root, image: descriptor.id, source: descriptor.source },
        error,
      );
    imageError(
      `Could not inspect image source: ${descriptor.source}`,
      sourceHint,
      { root, image: descriptor.id, source: descriptor.source },
      error,
    );
  }
}

function validateImage(image: ImageSource, descriptor: ImageDescriptor, root: string): ImageSource {
  if (
    typeof image !== "object" ||
    image === null ||
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  )
    imageError(`Converter returned an invalid image source for ${descriptor.id}`, converterHint, {
      root,
      image: descriptor.id,
      source: descriptor.source,
    });
  return image;
}

/** Decode the master once per source state; a converter failure keeps its cause. */
async function decodeSource(
  converter: ImageConverter,
  absolute: string,
  descriptor: ImageDescriptor,
  root: string,
): Promise<ImageSource> {
  try {
    return validateImage(await converter.decode(absolute), descriptor, root);
  } catch (error) {
    if (error instanceof SsgError) throw error;
    imageError(
      `Could not decode image ${descriptor.id}`,
      converterHint,
      { root, image: descriptor.id, source: descriptor.source },
      error,
    );
  }
}

/** Encode one variant once per source state; bytes are memoized by the caller. */
async function encodeVariant(
  converter: ImageConverter,
  image: ImageSource,
  variant: { readonly width: number; readonly format: string },
  descriptor: ImageDescriptor,
  root: string,
): Promise<Uint8Array> {
  const label = `${variant.width}.${variant.format}`;
  let bytes: Uint8Array;
  try {
    bytes = await converter.encode(image, variant);
  } catch (error) {
    if (error instanceof SsgError) throw error;
    imageError(
      `Could not encode image ${descriptor.id} at ${label}`,
      converterHint,
      { root, image: descriptor.id, variant: label },
      error,
    );
  }
  if (!(bytes instanceof Uint8Array))
    imageError(
      `Converter returned no bytes for image ${descriptor.id} at ${label}`,
      converterHint,
      {
        root,
        image: descriptor.id,
        variant: label,
      },
    );
  return bytes;
}

export interface PrepareImageOptions {
  /** Absolute project root; descriptor sources resolve from it. */
  root: string;
  /** Integration-private directory receiving the variants. */
  out: string;
  converter: ImageConverter;
  descriptors: readonly ImageDescriptor[];
  /** Memo owned by the calling configuration. */
  cache: ImageCache;
}

/**
 * Generate every declared variant: descriptors, then widths, then formats. A variant is
 * written as soon as it is encoded, so memory stays bounded by one variant; the memo
 * skips decoding and encoding when the master and the requested variants are unchanged.
 */
export async function prepareImage(options: PrepareImageOptions): Promise<void> {
  const { root, out, converter, descriptors, cache } = options;
  // The container must exist even without descriptors: the core copies it.
  await mkdir(out, { recursive: true });
  for (const descriptor of descriptors) {
    const absolute = path.resolve(root, descriptor.source);
    const info = await inspectSource(absolute, descriptor, root);
    const state = `${info.mtimeMs}:${info.size}`;
    let entry = cache.entries.get(absolute);
    if (!entry || entry.key !== state) {
      // Replacing the entry releases the bytes decoded from the previous state.
      entry = {
        key: state,
        image: await decodeSource(converter, absolute, descriptor, root),
        variants: new Map(),
      };
      cache.entries.set(absolute, entry);
    }
    for (const width of descriptor.widths)
      for (const format of descriptor.formats) {
        const key = `${width}:${format}`;
        let bytes = entry.variants.get(key);
        if (bytes === undefined) {
          bytes = await encodeVariant(converter, entry.image, { width, format }, descriptor, root);
          entry.variants.set(key, bytes);
        }
        const variant = variantPath(descriptor, width, format);
        const target = path.join(out, variant);
        try {
          await mkdir(path.dirname(target), { recursive: true });
        } catch (error) {
          imageError(
            `Could not create image directory: ${path.posix.dirname(variant)}`,
            writeHint,
            { root, image: descriptor.id },
            error,
          );
        }
        try {
          await writeFile(target, bytes);
        } catch (error) {
          imageError(
            `Could not write image ${descriptor.id} at ${width}.${format}`,
            writeHint,
            { root, image: descriptor.id, variant: `${width}.${format}` },
            error,
          );
        }
      }
  }
}
