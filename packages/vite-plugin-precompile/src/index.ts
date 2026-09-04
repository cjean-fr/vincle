import type { Plugin, ResolvedConfig } from "vite";

import { RUNTIME_SOURCE } from "@vincle/precompile-core";

import precompileTransform, {
  type PluginConfig,
  type RenderAttr,
  type RenderEscape,
} from "./transformer.js";

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
  // A misconfigured plugin is a config error: name the option and the value,
  // and fail now — not mid-build when Vite is transforming the first file.
  if (
    config?.runtimeSource !== undefined &&
    (typeof config.runtimeSource !== "string" || config.runtimeSource.length === 0)
  ) {
    const got =
      typeof config.runtimeSource === "string"
        ? JSON.stringify(config.runtimeSource)
        : typeof config.runtimeSource === "undefined"
          ? "undefined"
          : typeof config.runtimeSource;
    throw new Error(
      `[vincle/vite-plugin-precompile] config: runtimeSource must be a non-empty string module ` +
        `specifier, e.g. "@vincle/core/jsx-precompile-runtime", got ${got}.`,
    );
  }

  let rs: string | null = null;
  let renderAttr: RenderAttr | null = null;
  /**
   * The runtime's `jsxEscape` function, loaded at build time unless
   * `compatibility` is on.
   * Used to escape static text content using the target runtime's own
   * escaping rules, ensuring byte-identity between precompile and dynamic
   * paths. Falls back to Vincle's `escapeContent` when the runtime has no
   * `jsxEscape` export (should not happen for compatible runtimes).
   */
  let renderEscape:
    | ((value: unknown) => string | { value: string } | Promise<string | { value: string }>)
    | null = null;

  /**
   * When jsxImportSource is set, this holds the candidate path
   * ("{source}/jsx-runtime") so buildStart can probe it at build time.
   * If the probe finds jsxTemplate the virtual module re-exports from
   * there; otherwise it falls back to RUNTIME_SOURCE.
   */
  let candidateFrameworkRuntime: string | null = null;

  /**
   * When the user provides an explicit runtimeSource, that path is used
   * directly for both the transform output and the build-time
   * import.  This is null when runtimeSource is left unset (auto-detect).
   */
  let explicitRuntimeSource: string | null = null;

  /**
   * The actual module that the virtual module re-exports from.  Set
   * during buildStart — either the framework's runtime (when the probe
   * succeeds) or @vincle/core/jsx-precompile-runtime.
   *
   * When runtimeSource is explicit, the virtual module is not involved
   * and this field is unused; the build-time load reads explicitRuntimeSource
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
        esbuild && typeof esbuild === "object"
          ? (esbuild as { jsxImportSource?: string }).jsxImportSource
          : undefined;
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
      // source for the build-time dynamic import (the virtual module
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
          this.error(
            `[vincle/vite-plugin-precompile] failed to probe ${candidateFrameworkRuntime}: ${String(err)}. ` +
              `The module for jsxImportSource "${candidateFrameworkRuntime.replace(FRAMEWORK_RUNTIME_SUFFIX, "")}" ` +
              "could not be imported — is it installed and resolvable from where Vite runs? " +
              "Or set an explicit runtimeSource.",
          );
        }
        if (typeof mod["jsxTemplate"] !== "function") {
          this.error(
            `[vincle/vite-plugin-precompile] jsxImportSource "${candidateFrameworkRuntime.replace(FRAMEWORK_RUNTIME_SUFFIX, "")}" ` +
              'does not support the precompile transform — its jsx-runtime has no "jsxTemplate" export. ' +
              "Use Preact, Hono, or @vincle/core, or set an explicit runtimeSource to a module that " +
              "exports jsxTemplate, jsxAttr and jsxEscape.",
          );
        }
        resolvedRuntimeSource = candidateFrameworkRuntime;
      }

      // Which output the transform emits is decided by the runtime, not by an
      // option: a runtime that declares the `"vincle"` precompile dialect gets
      // the corrected, sanitized output, because it is the one that promises a
      // precompiled page renders the same bytes as a dynamic one. Any other —
      // Preact, Hono, an adapter that re-exports only the three helpers — gets
      // Deno's output, which is what its own helpers were written against.
      //
      // The import is the only thing inside the `try`: checking exports in
      // there sent their absence through the catch, which then reported a
      // module that would not load and pointed at an installation that was
      // fine.
      const source = resolvedRuntimeSource;
      let mod: { jsxAttr?: RenderAttr; jsxEscape?: RenderEscape; precompileDialect?: unknown };
      try {
        mod = (await import(/* @vite-ignore */ source)) as typeof mod;
      } catch (err) {
        // Nothing to read, so nothing to improve on: Deno's output it is. Not
        // an error — the generated code imports the helpers itself, and a
        // module Vite can resolve but this build cannot is a normal setup.
        this.warn(
          `[vincle/vite-plugin-precompile] could not load "${source}" at build time ` +
            `(${String(err)}), so the output follows Deno's precompile transform. Static ` +
            "attributes are inlined without URL or CSS filtering.",
        );
        return;
      }

      if (mod.precompileDialect !== "vincle") return;

      if (typeof mod.jsxAttr !== "function" || typeof mod.jsxEscape !== "function") {
        this.error(
          `[vincle/vite-plugin-precompile] "${source}" declares the "vincle" precompile dialect ` +
            "but does not export both jsxAttr and jsxEscape, so build-time sanitization cannot " +
            'run — a literal href="javascript:…" would reach the bundle verbatim. Re-export ' +
            "the runtime whole (`export * from`) rather than naming a subset.",
        );
      }
      renderAttr = mod.jsxAttr;

      renderEscape = mod.jsxEscape;
    },

    transform(code: string, id: string) {
      if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return;
      if (id.includes("node_modules")) return;
      if (!code.includes("<")) return;

      const result = precompileTransform(
        code,
        id,
        { runtimeSource: rs! },
        renderAttr ?? undefined,
        renderEscape ?? undefined,
      );

      if (!result || result.code === code) return;
      return { code: result.code, map: result.map };
    },
  };
}
