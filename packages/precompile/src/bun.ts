import { readFile } from "node:fs/promises";

import { assertRuntimeSource } from "./config.js";
import { RUNTIME_SOURCE } from "./core/index.js";
import precompileTransform, {
  type PluginConfig,
  type RenderAttr,
  type RenderEscape,
  detectJsxImportSource,
  normalizeJsxSource,
} from "./index.js";
import { declaredRuntimeHelpers } from "./runtime-helpers.js";

export type { PluginConfig };

/**
 * The shape of Bun's plugin API this depends on, nothing more: declared here so
 * the package type-checks without Bun's globals, which the Vite adapter next to
 * it has no use for.
 */
interface BunBuilder {
  onLoad(
    constraints: { filter: RegExp },
    callback: (args: {
      path: string;
    }) => Promise<{ contents: string; loader: "tsx" | "jsx" } | undefined>,
  ): void;
}

export interface BunPrecompilePlugin {
  name: string;
  setup(build: BunBuilder): Promise<void>;
}

const JSX_FILE = /\.[jt]sx$/;

function toRuntimePath(source: string): string {
  if (source.endsWith("/jsx-runtime") || source.endsWith("/jsx-dev-runtime")) return source;
  return `${source}/jsx-runtime`;
}

/**
 * The transform as a Bun plugin, for a server with no Vite in front of it.
 *
 * A page rendered per request is where precompiling pays, and a server that
 * imports its own modules never reaches a Vite plugin, whatever the config says.
 * Load this from a preload script instead:
 *
 * ```ts
 * // preload.ts
 * import { plugin } from "bun";
 * import precompile from "@vincle/precompile/bun";
 *
 * plugin(precompile());
 * ```
 *
 * ```bash
 * bun --preload ./preload.ts server.ts
 * ```
 *
 * Two differences from the Vite adapter, both from what Bun's plugin API offers:
 * there is no virtual module, so the helpers are imported from `runtimeSource`
 * (`@vincle/core/jsx-runtime` unless you say otherwise), and there is no
 * end-of-build hook, so nothing warns when this plugin never matches a file. On
 * Bun the check is direct: a transformed module imports `jsxTemplate`.
 */
export default function precompileBun(config?: PluginConfig): BunPrecompilePlugin {
  assertRuntimeSource(config);
  const runtimeSource = config?.runtimeSource ?? RUNTIME_SOURCE;

  return {
    name: "@vincle/precompile",

    async setup(build: BunBuilder): Promise<void> {
      // Which output the transform emits is the runtime's call, not an option:
      // only a runtime declaring the `"vincle"` dialect promises that a
      // precompiled page renders the same bytes as a dynamic one, so only that
      // one gets the corrected, sanitized output. Anything else gets Deno's,
      // which its own helpers were written against.
      let mod: Parameters<typeof declaredRuntimeHelpers>[0] = {};
      try {
        mod = await import(runtimeSource);
      } catch {
        // An unavailable build-time import keeps compatibility output; the
        // generated code still imports its helpers at runtime.
      }
      // Validation stays outside the import catch: a broken dialect promise
      // must not silently disable build-time sanitization.
      const helpers = declaredRuntimeHelpers(mod, runtimeSource);
      const renderAttr = helpers?.jsxAttr;
      const renderEscape = helpers?.jsxEscape;

      const perFileCache = new Map<
        string,
        { renderAttr: RenderAttr | undefined; renderEscape: RenderEscape | undefined } | null
      >();

      build.onLoad({ filter: JSX_FILE }, async ({ path }) => {
        if (path.includes("node_modules")) return undefined;

        const code = await readFile(path, "utf8");
        if (!code.includes("<")) return undefined;

        // Per-file runtime via pragma.
        let runtimeSourceForFile = runtimeSource;
        let renderAttrForFile = renderAttr;
        let renderEscapeForFile = renderEscape;

        const declared = detectJsxImportSource(code);
        if (
          declared !== null &&
          normalizeJsxSource(declared) !== normalizeJsxSource(runtimeSource)
        ) {
          const runtimePath = toRuntimePath(declared);
          if (!perFileCache.has(runtimePath)) {
            let loaded: {
              renderAttr: RenderAttr | undefined;
              renderEscape: RenderEscape | undefined;
            } | null = null;
            try {
              const mod = (await import(/* @vite-ignore */ runtimePath)) as Record<string, unknown>;
              if (typeof mod["jsxTemplate"] !== "function") {
                loaded = null;
              } else {
                const helpers = declaredRuntimeHelpers(
                  mod as Parameters<typeof declaredRuntimeHelpers>[0],
                  runtimePath,
                );
                loaded = {
                  renderAttr: helpers?.jsxAttr ?? undefined,
                  renderEscape: helpers?.jsxEscape ?? undefined,
                };
              }
            } catch {
              loaded = null;
            }
            perFileCache.set(runtimePath, loaded);
          }
          const cached = perFileCache.get(runtimePath);
          if (cached === null || cached === undefined) {
            return undefined; // delegate to bundler
          }
          runtimeSourceForFile = runtimePath;
          renderAttrForFile = cached.renderAttr;
          renderEscapeForFile = cached.renderEscape;
        }

        const result = precompileTransform(
          code,
          path,
          { runtimeSource: runtimeSourceForFile },
          renderAttrForFile,
          renderEscapeForFile,
        );
        if (result === null || result.code === code) return undefined;

        return { contents: result.code, loader: path.endsWith(".tsx") ? "tsx" : "jsx" };
      });
    },
  };
}
