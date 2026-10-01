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

import { RUNTIME_SOURCE } from "./core/index.js";
import { collectNode } from "./emit.js";
import { normalizeRuntimeHelpers } from "./runtime-helpers.js";
import { injectRuntimeImport } from "./runtime-import.js";

export type { PluginConfig, RenderAttr, RenderEscape, TransformResult } from "./types.js";

export default function precompileTransform(
  code: string,
  id: string,
  config?: PluginConfig,
  renderAttr?: RenderAttr,
  renderEscape?: RenderEscape,
): TransformResult | null {
  const rtSource = config?.runtimeSource ?? RUNTIME_SOURCE;
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
