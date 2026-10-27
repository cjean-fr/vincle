import type { PluginConfig } from "./types.js";

import { RUNTIME_SOURCE } from "./core/index.js";
import { ERR_PRECOMPILE_CONFIG, vincleError } from "./errors.js";

/** All entry points reject the same invalid runtime before emitting imports. */
export function runtimeSource(config?: PluginConfig): string {
  const source = config?.runtimeSource;
  if (source === undefined) return RUNTIME_SOURCE;
  if (typeof source !== "string" || source.length === 0) {
    const got = typeof source === "string" ? JSON.stringify(source) : typeof source;
    throw vincleError(
      `[vincle/precompile] config: runtimeSource must be a non-empty string module ` +
        `specifier, e.g. "@vincle/core/jsx-precompile-runtime", got ${got}.`,
      ERR_PRECOMPILE_CONFIG,
    );
  }
  return source;
}
