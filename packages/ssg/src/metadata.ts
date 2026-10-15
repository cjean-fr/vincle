import type { SsgMeta } from "./types.js";

import { failure } from "./errors.js";

export function metadata(value: unknown, file: string): SsgMeta {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw failure(`Metadata must be an object: ${file}`, {
      reason: "INVALID_METADATA",
      hint: "Use a metadata object in export const meta or YAML frontmatter; arrays and null are not valid.",
      context: { file },
    });
  }
  const meta = { ...value } as SsgMeta;
  for (const field of ["locale", "translationKey"] as const) {
    if (meta[field] !== undefined && (typeof meta[field] !== "string" || !meta[field]))
      throw failure(`Metadata ${field} must be a non-empty string: ${file}`, {
        reason: "INVALID_METADATA",
        hint: `Set meta.${field} to a non-empty string.`,
        context: { file, field },
      });
  }
  for (const field of ["search", "sitemap", "incremental"] as const) {
    if (meta[field] !== undefined && typeof meta[field] !== "boolean")
      throw failure(`Metadata ${field} must be a boolean: ${file}`, {
        reason: "INVALID_METADATA",
        hint:
          `Set meta.${field} to true or false, not a quoted string or another value.` +
          (field === "incremental"
            ? " Use false for dynamic producers that must run on every dev rebuild."
            : ""),
        context: { file, field },
      });
  }
  if (
    meta.layout !== undefined &&
    meta.layout !== false &&
    (typeof meta.layout !== "string" || !meta.layout)
  ) {
    throw failure(`Metadata layout must be a file path or false: ${file}`, {
      reason: "INVALID_METADATA",
      hint: "Set meta.layout to a non-empty layout file path relative to the page, or false to disable layouts.",
      context: { file, field: "layout" },
    });
  }
  return meta;
}

export function moduleMeta(
  mod: Record<string, unknown>,
  file: string,
  initial: SsgMeta = {},
): SsgMeta {
  return metadata(
    {
      ...initial,
      ...metadata(mod["meta"], file),
      ...(mod["sitemap"] === undefined ? {} : { sitemap: mod["sitemap"] }),
    },
    file,
  );
}
