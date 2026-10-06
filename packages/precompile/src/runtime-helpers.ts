import type { RenderAttr, RenderEscape, RuntimeHelpers } from "./types.js";

import { escapeContent } from "./core/index.js";
import { ERR_PRECOMPILE_CONFIG, ERR_PRECOMPILE_HELPER, vincleError } from "./errors.js";

/** Validate the dialect promise once for both build adapters. */
export function declaredRuntimeHelpers(
  mod: { precompileDialect?: unknown; jsxAttr?: unknown; jsxEscape?: unknown },
  source: string,
): { jsxAttr: RenderAttr; jsxEscape: RenderEscape } | null {
  if (mod.precompileDialect !== "vincle") return null;
  if (typeof mod.jsxAttr !== "function" || typeof mod.jsxEscape !== "function") {
    throw vincleError(
      `[vincle/precompile] "${source}" declares the "vincle" precompile dialect ` +
        "but does not export both jsxAttr and jsxEscape, so build-time sanitization cannot " +
        'run: a literal href="javascript:…" would reach the bundle unfiltered. Re-export ' +
        "the runtime whole (`export * from`) rather than naming a subset.",
      ERR_PRECOMPILE_CONFIG,
    );
  }
  return { jsxAttr: mod.jsxAttr as RenderAttr, jsxEscape: mod.jsxEscape as RenderEscape };
}

/**
 * One runtime answer to text.
 *
 * `helper` and `subject` are there for the message: a runtime whose helper
 * answers in a shape nobody planned for must name itself, rather than be
 * reported as something else: the previous form of this check called every
 * unknown shape a `Promise`.
 */
function unwrapSerialized(
  result: string | { value: string } | Promise<string | { value: string }>,
  helper: string,
  subject: string,
): string {
  if (typeof result === "string") return result;
  if (result instanceof Promise) {
    throw vincleError(
      `[vincle/precompile] ${helper} returned a Promise for the static value ${subject}: ` +
        "a static value must serialize synchronously. This is a bug in the runtime that declared the " +
        '"vincle" precompile dialect.',
      ERR_PRECOMPILE_HELPER,
    );
  }
  const value: unknown = (result as { value?: unknown })?.value;
  if (typeof value === "string") return value;
  throw vincleError(
    `[vincle/precompile] ${helper} returned neither a string nor a { value: string } ` +
      `for the static value ${subject}, but ${result === null ? "null" : typeof result}. A runtime ` +
      'declaring the "vincle" precompile dialect must serialize to text.',
    ERR_PRECOMPILE_HELPER,
  );
}

/**
 * The frontier: whatever shapes the target runtime answers in, reduced once to
 * the two functions the transform actually uses.
 *
 * Returns `null` for compatibility mode: no runtime helper means no way
 * to improve on Deno's output. A caller that passes `renderAttr` alone keeps
 * Vincle's own `escapeContent` for text, which is what the plugin's own check
 * (both helpers, or neither) makes unreachable through it.
 */
export function normalizeRuntimeHelpers(
  renderAttr: RenderAttr | undefined,
  renderEscape: RenderEscape | undefined,
): RuntimeHelpers | null {
  if (renderAttr === undefined) return null;
  return {
    jsxAttr: (name, value) =>
      unwrapSerialized(renderAttr(name, value), "jsxAttr", JSON.stringify(name)),
    jsxEscape: renderEscape
      ? (text) => unwrapSerialized(renderEscape(text), "jsxEscape", "of a text node")
      : escapeContent,
  };
}
