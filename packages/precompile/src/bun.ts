import { readFile } from "node:fs/promises";

import { RUNTIME_SOURCE } from "./core/index.js";
import precompileTransform, {
  type PluginConfig,
  type RenderAttr,
  type RenderEscape,
} from "./index.js";

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
  const runtimeSource = config?.runtimeSource ?? RUNTIME_SOURCE;

  return {
    name: "@vincle/precompile",

    async setup(build: BunBuilder): Promise<void> {
      // Which output the transform emits is the runtime's call, not an option:
      // only a runtime declaring the `"vincle"` dialect promises that a
      // precompiled page renders the same bytes as a dynamic one, so only that
      // one gets the corrected, sanitized output. Anything else gets Deno's,
      // which its own helpers were written against.
      let renderAttr: RenderAttr | undefined;
      let renderEscape: RenderEscape | undefined;
      try {
        const mod = (await import(runtimeSource)) as {
          jsxAttr?: RenderAttr;
          jsxEscape?: RenderEscape;
          precompileDialect?: unknown;
        };
        if (
          mod.precompileDialect === "vincle" &&
          typeof mod.jsxAttr === "function" &&
          typeof mod.jsxEscape === "function"
        ) {
          renderAttr = mod.jsxAttr;
          renderEscape = mod.jsxEscape;
        }
      } catch {
        // Nothing to read, so nothing to improve on: Deno's output it is. The
        // generated code imports the helpers itself, so the page still renders.
      }

      build.onLoad({ filter: JSX_FILE }, async ({ path }) => {
        if (path.includes("node_modules")) return undefined;

        const code = await readFile(path, "utf8");
        if (!code.includes("<")) return undefined;

        const result = precompileTransform(code, path, { runtimeSource }, renderAttr, renderEscape);
        if (result === null || result.code === code) return undefined;

        return { contents: result.code, loader: path.endsWith(".tsx") ? "tsx" : "jsx" };
      });
    },
  };
}
