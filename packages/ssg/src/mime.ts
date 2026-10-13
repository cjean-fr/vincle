import { failure } from "./errors.js";

/** Extension keys include their leading dot; custom values override built-ins. */
export type MimeTypes = Readonly<Partial<Record<`.${string}`, string>>>;
export const defaultMimeTypes: MimeTypes = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jxl": "image/jxl",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
});

export function resolveMimeTypes(custom: MimeTypes = {}): Readonly<Record<string, string>> {
  const types: Record<string, string> = {};
  for (const [extension, value] of Object.entries({ ...defaultMimeTypes, ...custom })) {
    if (
      !/^\.[a-z0-9][a-z0-9._+-]*$/i.test(extension) ||
      typeof value !== "string" ||
      !/^[^\s/;]+\/[^\s/;]+(?:;[^\r\n]*)?$/.test(value)
    ) {
      throw failure("Invalid MIME type mapping", {
        reason: "INVALID_CONFIG",
        hint: 'Use dotted extensions and HTTP media types, for example { ".md": "text/markdown; charset=utf-8" }.',
        context: { extension },
      });
    }
    types[extension.toLowerCase()] = value;
  }
  return types;
}
