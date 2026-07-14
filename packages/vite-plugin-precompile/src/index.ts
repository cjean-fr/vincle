import type { Plugin, ResolvedConfig } from "vite";

import { RUNTIME_SOURCE } from "@vincle/precompile-core";

import precompileTransform, { type PluginConfig, type RenderAttr } from "./transformer.js";

export type { PluginConfig };

/**
 * Virtual module ID that re-exports the three precompile runtime helpers
 * (jsxTemplate, jsxAttr, jsxEscape). Users never need to create a physical
 * adapter file — the plugin provides this module automatically when no
 * explicit runtimeSource is configured.
 */
const VIRTUAL_MODULE_ID = "virtual:vincle-precompile-runtime";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_MODULE_ID;

/**
 * Convention for deriving a framework's precompile runtime path from its
 * jsxImportSource.  Matches Deno's own JSX transform, which appends
 * `/jsx-runtime` to the import source value.
 */
const FRAMEWORK_RUNTIME_SUFFIX = "/jsx-runtime";

export default function vitePrecompile(config?: PluginConfig): Plugin {
  let rs: string | null = null;
  let renderAttr: RenderAttr | null = null;

  /**
   * When jsxImportSource is set, this holds the candidate path
   * ("{source}/jsx-runtime") so buildStart can probe it at build time.
   * If the probe finds jsxTemplate the virtual module re-exports from
   * there; otherwise it falls back to RUNTIME_SOURCE.
   */
  let candidateFrameworkRuntime: string | null = null;

  /**
   * When the user provides an explicit runtimeSource, that path is used
   * directly for both the transform output and the secure-mode build-time
   * import.  This is null when runtimeSource is left unset (auto-detect).
   */
  let explicitRuntimeSource: string | null = null;

  /**
   * The actual module that the virtual module re-exports from.  Set
   * during buildStart — either the framework's runtime (when the probe
   * succeeds) or @vincle/core/jsx-precompile-runtime.
   *
   * When runtimeSource is explicit, the virtual module is not involved
   * and this field is unused; secure mode reads explicitRuntimeSource
   * first.
   */
  let resolvedRuntimeSource: string = RUNTIME_SOURCE;

  return {
    name: "@vincle/vite-plugin-precompile",
    enforce: "pre",

    configResolved(resolvedConfig: ResolvedConfig) {
      if (config?.runtimeSource) {
        rs = config.runtimeSource;
        explicitRuntimeSource = config.runtimeSource;
        return;
      }

      rs = VIRTUAL_MODULE_ID;

      const esbuild = resolvedConfig.esbuild;
      const jsxImportSource =
        esbuild && typeof esbuild === "object" ? esbuild.jsxImportSource : undefined;
      if (jsxImportSource) {
        candidateFrameworkRuntime = `${jsxImportSource}${FRAMEWORK_RUNTIME_SUFFIX}`;
      }
    },

    resolveId(id: string) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },

    load(id: string) {
      if (id === RESOLVED_VIRTUAL_ID) {
        return [
          "export { jsxTemplate, jsxAttr, jsxEscape }",
          `  from "${resolvedRuntimeSource}";`,
        ].join("\n");
      }
      return null;
    },

    async buildStart() {
      // If the user provided an explicit runtimeSource, that is the
      // source for the secure-mode dynamic import (the virtual module
      // is bypassed, so resolvedRuntimeSource is irrelevant).
      if (explicitRuntimeSource) {
        resolvedRuntimeSource = explicitRuntimeSource;
      } else if (candidateFrameworkRuntime) {
        // Probe {jsxImportSource}/jsx-runtime for the precompile helpers.
        // Preact, Hono and @vincle/core export jsxTemplate here; React
        // does not — the probe throws a clear build error.
        let mod: Record<string, unknown>;
        try {
          mod = (await import(/* @vite-ignore */ candidateFrameworkRuntime)) as Record<
            string,
            unknown
          >;
        } catch (err) {
          this.error(`failed to probe ${candidateFrameworkRuntime}: ${String(err)}`);
          return;
        }
        if (typeof mod["jsxTemplate"] !== "function") {
          this.error(
            `jsxImportSource "${candidateFrameworkRuntime.replace(FRAMEWORK_RUNTIME_SUFFIX, "")}" does not support the precompile transform. Use Preact, Hono, or @vincle/core, or set an explicit runtimeSource.`,
          );
          return;
        }
        resolvedRuntimeSource = candidateFrameworkRuntime;
      }

      if (!config?.secure) return;
      // Secure mode sanitizes static attributes at build time using the
      // runtime's own jsxAttr, so there is no duplicated security logic and no
      // runtime cost. The runtime module is the one the app already depends on.
      const source = resolvedRuntimeSource;
      try {
        const mod = (await import(/* @vite-ignore */ source)) as {
          jsxAttr?: RenderAttr;
        };
        if (typeof mod.jsxAttr === "function") {
          renderAttr = mod.jsxAttr;
        } else {
          this.error(
            `secure mode: "${source}" has no "jsxAttr" export — cannot sanitize static attributes`,
          );
        }
      } catch (err) {
        this.error(`secure mode: failed to load "${source}" (${String(err)})`);
      }
    },

    transform(code: string, id: string) {
      if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return;
      if (id.includes("node_modules")) return;
      if (!code.includes("<")) return;

      const result = precompileTransform(
        code,
        id,
        { runtimeSource: rs!, secure: config?.secure },
        renderAttr ?? undefined,
      );

      if (!result || result.code === code) return;
      return { code: result.code, map: result.map };
    },
  };
}
