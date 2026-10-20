import type { InlineConfig } from "vite";

import { failure } from "./errors.js";

/** Normalize a public path prefix to "/" or "/segment/.../". */
export function basePath(base: string | undefined): string | undefined {
  if (base === undefined) return undefined;
  const normalized = `/${base.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
  if (
    base.startsWith("//") ||
    /[?#\\\0]/.test(base) ||
    /^[a-z][a-z\d+.-]*:/i.test(base) ||
    normalized.includes("//") ||
    normalized.split("/").some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment))
  )
    throw failure(`Invalid base: ${base}`, {
      reason: "INVALID_CONFIG",
      hint: 'Set base to a path prefix such as "/docs/", without host, query, fragment or . and .. segments.',
      context: { base },
    });
  return normalized;
}

/** SSG base drives Vite's; a different explicit Vite base is a conflict, not a silent override. */
export function withBase(config: InlineConfig, base: string | undefined): InlineConfig {
  if (base === undefined) return config;
  if (config.base !== undefined && !sameBase(config.base, base))
    throw failure("Vite base conflicts with the SSG base.", {
      reason: "INVALID_CONFIG",
      hint: "Remove base from the Vite configuration: the SSG base option sets it.",
      context: { base, viteBase: config.base },
    });
  return { ...config, base };
}

function sameBase(viteBase: string, base: string): boolean {
  try {
    return basePath(viteBase) === base;
  } catch {
    return false; // A relative or full-URL Vite base never equals an SSG path prefix.
  }
}
