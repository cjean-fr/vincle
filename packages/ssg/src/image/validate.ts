import type { ImageConverter, ImageDescriptor, ImageOptions } from "./types.js";

import { failure } from "../errors.js";
import { isValidRelativePath } from "../outputs.js";
import { variantPath } from "./url.js";

/** Encodable extension characters, the same set as the development MIME table. */
const extension = /^[a-z0-9][a-z0-9._+-]*$/i;

const converterHint =
  "Provide a converter with decode() and encode() functions and a non-empty formats array.";
const descriptorHint =
  "Declare each descriptor as { id, source, directory, name, widths, formats }.";
const idsHint = "Give every descriptor a unique id: <Picture> resolves images by id.";
const pathsHint = "Use a relative path with forward slashes and no empty, . or .. segments.";
const widthsHint = "List positive integer widths, for example [80, 160, 256].";
const formatsHint =
  "Use formats declared in converter.formats; the last one is the fallback <img> format.";

interface ConfigErrorDetails {
  /** Configuration field at fault, for example "widths". */
  field: string;
  hint: string;
  /** 1-based descriptor position; converter-level failures report the first one. */
  index?: number;
  /** Descriptor id, or #index when it has none. */
  image?: string;
  /** Faulty string or number value, when there is one. */
  value?: string | number;
}

function configError(summary: string, details: ConfigErrorDetails): never {
  const index = details.index ?? 1;
  throw failure(summary, {
    reason: "INVALID_CONFIG",
    hint: details.hint,
    context: {
      phase: "images",
      index,
      image: details.image ?? `#${index}`,
      field: details.field,
      ...(details.value === undefined ? {} : { value: details.value }),
    },
  });
}

/** Keep the diagnostic context to string and number scalars. */
function withValue(details: ConfigErrorDetails, value: unknown): ConfigErrorDetails {
  return typeof value === "string" || typeof value === "number" ? { ...details, value } : details;
}

/** Validate converter formats; the first violation wins so tests stay deterministic. */
function validateConverter(converter: ImageConverter): readonly string[] {
  if (typeof converter?.decode !== "function" || typeof converter.encode !== "function")
    configError("images(): options.converter must provide decode() and encode() functions.", {
      field: "converter",
      hint: converterHint,
    });
  const formats = converter.formats;
  if (
    !Array.isArray(formats) ||
    formats.length === 0 ||
    formats.some((format) => typeof format !== "string" || !extension.test(format))
  )
    configError(
      'images(): converter.formats must be a non-empty array of extension strings such as "avif".',
      { field: "converter.formats", hint: converterHint },
    );
  if (new Set(formats).size !== formats.length)
    configError("images(): converter.formats is not unique.", {
      field: "converter.formats",
      hint: converterHint,
    });
  return formats;
}

/**
 * Validate the whole configuration synchronously, so an invalid declaration fails at
 * the `images()` call instead of in the middle of a build. Never mutates its options.
 *
 * Check order is part of the contract: converter, descriptors container, then per
 * descriptor id, source, directory, name, widths and formats; finally prefix and file
 * uniqueness. The first violation wins.
 */
export function validateImages(options: ImageOptions): void {
  const converterFormats = validateConverter(options.converter);
  const descriptors = options.descriptors;
  if (!Array.isArray(descriptors))
    configError("images(): options.descriptors must be an array of image descriptors.", {
      field: "descriptors",
      hint: descriptorHint,
    });

  const ids = new Set<string>();
  const declared: { descriptor: ImageDescriptor; image: string; index: number }[] = [];
  for (const [position, descriptor] of descriptors.entries()) {
    const index = position + 1;
    if (typeof descriptor !== "object" || descriptor === null || Array.isArray(descriptor))
      configError(`images(): descriptor #${index} must be an object.`, {
        field: "descriptor",
        hint: descriptorHint,
        index,
      });
    const positionOf = { index };

    // id: a non-empty string, unique within this call.
    const declaredId = typeof descriptor.id === "string" ? descriptor.id : undefined;
    const image = declaredId === undefined || declaredId.trim() === "" ? undefined : declaredId;
    if (image === undefined)
      configError(`images(): image #${index} has no id.`, {
        ...positionOf,
        field: "id",
        hint: idsHint,
      });
    if (ids.has(image))
      configError(`images(): duplicate image id ${JSON.stringify(image)}.`, {
        ...positionOf,
        field: "id",
        hint: idsHint,
        image,
      });
    ids.add(image);
    const named = { ...positionOf, image };

    // source: a non-empty string, without NUL; resolved from the project root later.
    if (
      typeof descriptor.source !== "string" ||
      descriptor.source === "" ||
      descriptor.source.includes("\0")
    )
      configError(
        descriptor.source === ""
          ? `images(): image ${image} has no source.`
          : `images(): image ${image} has an invalid source ${JSON.stringify(descriptor.source)}.`,
        withValue({ ...named, field: "source", hint: pathsHint }, descriptor.source),
      );

    // directory: a relative forward-slash path inside the integration's output directory.
    if (typeof descriptor.directory !== "string" || !isValidRelativePath(descriptor.directory))
      configError(
        `images(): image ${image} has an invalid directory ${JSON.stringify(descriptor.directory)}.`,
        withValue({ ...named, field: "directory", hint: pathsHint }, descriptor.directory),
      );

    // name: one relative path segment, so a prefix cannot leave its directory.
    if (
      typeof descriptor.name !== "string" ||
      !isValidRelativePath(descriptor.name) ||
      descriptor.name.includes("/")
    )
      configError(
        `images(): image ${image} has an invalid name ${JSON.stringify(descriptor.name)}.`,
        withValue({ ...named, field: "name", hint: pathsHint }, descriptor.name),
      );

    // widths: non-empty, positive safe integers, unique.
    const widths: readonly unknown[] = Array.isArray(descriptor.widths) ? descriptor.widths : [];
    if (widths.length === 0)
      configError(`images(): image ${image} declares no widths.`, {
        ...named,
        field: "widths",
        hint: widthsHint,
      });
    for (const width of widths)
      if (typeof width !== "number" || !Number.isSafeInteger(width) || width <= 0)
        configError(
          `images(): image ${image} width ${String(width)} is not a positive integer.`,
          withValue({ ...named, field: "widths", hint: widthsHint }, width),
        );
    if (new Set(widths).size !== widths.length)
      configError(`images(): image ${image} declares duplicate widths.`, {
        ...named,
        field: "widths",
        hint: widthsHint,
      });

    // formats: non-empty, declared by the converter, unique.
    const formats: readonly unknown[] = Array.isArray(descriptor.formats) ? descriptor.formats : [];
    if (formats.length === 0)
      configError(`images(): image ${image} declares no formats.`, {
        ...named,
        field: "formats",
        hint: formatsHint,
      });
    for (const format of formats)
      if (typeof format !== "string" || !converterFormats.includes(format))
        configError(
          `images(): image ${image} format ${JSON.stringify(format)} is not supported by the converter.`,
          withValue({ ...named, field: "formats", hint: formatsHint }, format),
        );
    if (new Set(formats).size !== formats.length)
      configError(`images(): image ${image} declares duplicate formats.`, {
        ...named,
        field: "formats",
        hint: formatsHint,
      });

    declared.push({ descriptor, image, index });
  }

  // Prefix and file uniqueness come after every descriptor's own fields.
  const prefixes = new Map<string, string>();
  const files = new Map<string, string>();
  for (const { descriptor, image, index } of declared) {
    const positionOf = { index, image };
    // Two descriptors may not share one directory/name prefix.
    const prefix = `${descriptor.directory}/${descriptor.name}`;
    const owner = prefixes.get(prefix);
    if (owner !== undefined)
      configError(
        `images(): images ${owner} and ${image} write the same directory/name ${JSON.stringify(prefix)}.`,
        { ...positionOf, field: "directory/name", hint: pathsHint },
      );
    prefixes.set(prefix, image);

    // Strictly stronger file-level net: no two variants may resolve to one path.
    for (const width of descriptor.widths)
      for (const format of descriptor.formats) {
        const file = variantPath(descriptor, width, format);
        const writer = files.get(file);
        if (writer !== undefined)
          configError(
            `images(): images ${writer} and ${image} write the same file ${JSON.stringify(file)}.`,
            { ...positionOf, field: "files", hint: pathsHint },
          );
        files.set(file, image);
      }
  }
}
