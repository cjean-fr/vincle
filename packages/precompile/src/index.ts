import MagicString from "magic-string";
import { parseSync, type Program } from "oxc-parser";

import type {
  AnyNode,
  PluginConfig,
  RenderAttr,
  RenderEscape,
  Replacement,
  TransformContext,
  TransformResult,
} from "./types.js";

import { assertRuntimeSource } from "./config.js";
import { RUNTIME_SOURCE } from "./core/index.js";
import { collectNode } from "./emit.js";
import { normalizeRuntimeHelpers } from "./runtime-helpers.js";
import { injectRuntimeImport } from "./runtime-import.js";

export type { PluginConfig, RenderAttr, RenderEscape, TransformResult } from "./types.js";

/**
 * Extract the JSX import source declared by a `@jsxImportSource` pragma, if any.
 * Only leading comments are considered, so a mention in code does not count.
 * Returns `null` when no pragma is present (the file is treated as using the
 * configured source).
 */
function detectJsxImportSource(code: string): string | null {
  const head = code.slice(0, 2048);
  const match = head.match(/@jsxImportSource\s+([^\s*]+)/);
  return match ? match[1]! : null;
}

/**
 * Canonical form of a JSX import source: strip the `/jsx-runtime` or
 * `/jsx-dev-runtime` suffix (and any trailing file extension) so that
 * `@vincle/core` and `@vincle/core/jsx-runtime` compare equal.
 */
function normalizeJsxSource(src: string): string {
  return src.replace(/\/jsx-(dev-)?runtime(\.[a-z]+)?$/, "").replace(/\.[a-z]+$/, "");
}

export default function precompileTransform(
  code: string,
  id: string,
  config?: PluginConfig,
  renderAttr?: RenderAttr,
  renderEscape?: RenderEscape,
): TransformResult | null {
  assertRuntimeSource(config);
  const rtSource = config?.runtimeSource ?? RUNTIME_SOURCE;

  // Respect the JSX import source declared by the file. A file whose source
  // is not the runtime configured for this build is left untouched: its JSX
  // is compiled later by the bundler's own transform, which honours the
  // pragma. Returning `null` means "no change" (verbatim source).
  const declared = detectJsxImportSource(code);
  if (declared !== null && normalizeJsxSource(declared) !== normalizeJsxSource(rtSource)) {
    return null;
  }

  const lang = id.endsWith(".tsx") ? "tsx" : "jsx";

  const result = parseSync(id, code, {
    lang,
    sourceType: "unambiguous",
    range: true,
    preserveParens: false,
  });

  if (result.errors.length > 0) {
    const isCritical = result.errors.some((e: { severity: string }) => e.severity === "Error");
    if (isCritical) return null;
  }

  const program = result.program as Program;
  const helpers = normalizeRuntimeHelpers(renderAttr, renderEscape);
  const ctx: TransformContext = {
    source: code,
    used: new Set<string>(),
    helpers,
    // The two are one decision: no attribute serializer means no way to improve
    // on Deno's output, so Deno's output is what gets emitted.
    compatibility: helpers === null,
  };
  const replacements: Replacement[] = [];

  for (const stmt of program.body) {
    collectNode(stmt as unknown as AnyNode, ctx, replacements);
  }

  if (replacements.length === 0) return null;

  const s = new MagicString(code);
  for (const r of replacements) s.overwrite(r.start, r.end, r.text);
  // Inject the import through the same MagicString, BEFORE generateMap,
  // a post-hoc string splice would shift every line below it out of the map.
  injectRuntimeImport(s, program, code, rtSource, [...ctx.used]);

  if (!s.hasChanged()) return null;
  return {
    code: s.toString(),
    map: s.generateMap({ hires: "boundary", source: id, includeContent: true }),
  };
}
