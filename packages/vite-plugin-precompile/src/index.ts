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
  // A misconfigured plugin is a config error: name the option and the value,
  // and fail now — not mid-build when Vite is transforming the first file.
  if (config?.runtimeSource !== undefined && (typeof config.runtimeSource !== "string" || config.runtimeSource.length === 0)) {
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
  if (config?.secure !== undefined && typeof config.secure !== "boolean") {
    throw new Error(
      `[vincle/vite-plugin-precompile] config: secure must be a boolean, got ${JSON.stringify(config.secure)}. ` +
        "Set secure: false for Deno-precompile-compatible behavior (static attributes trusted).",
    );
  }

  let rs: string | null = null;
  let renderAttr: RenderAttr | null = null;
  /**
   * The runtime's `jsxEscape` function, loaded at build time in secure mode.
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

      if (config?.secure === false) {
        // Explicit opt-out: Deno-precompile-compatible behavior — static
        // attributes are trusted and inlined verbatim (name-remapped and
        // HTML-escaped, but no URL/CSS sanitization).
        return;
      }
      // Secure mode (default): sanitizes static attributes at build time using
      // the runtime's own jsxAttr, so there is no duplicated security logic and
      // no runtime cost. The runtime module is the one the app already depends on.
      //
      // Also loads jsxEscape for static text content, so precompiled text uses
      // the target runtime's own escaping rules (byte-identity). Vincle's extra
      // protections (rawtext guard, URL blocking) are applied on top.
      const source = resolvedRuntimeSource;
      try {
        const mod = (await import(/* @vite-ignore */ source)) as {
          jsxAttr?: RenderAttr;
          jsxEscape?: (
            value: unknown,
          ) => string | { value: string } | Promise<string | { value: string }>;
        };
        if (typeof mod.jsxAttr === "function") {
          renderAttr = mod.jsxAttr;
        } else {
          this.error(
            `[vincle/vite-plugin-precompile] secure mode: "${source}" has no "jsxAttr" export — ` +
              "cannot sanitize static attributes. Set runtimeSource to a module that exports jsxAttr " +
              "and jsxEscape, or set secure: false to trust static attributes (Deno-compatible).",
          );
        }
        if (typeof mod.jsxEscape === "function") {
          renderEscape = mod.jsxEscape;
        }
      } catch (err) {
        this.error(
          `[vincle/vite-plugin-precompile] secure mode: failed to load "${source}" (${String(err)}). ` +
            "Check that the module is installed and resolvable from where Vite runs, or set secure: false.",
        );
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
        renderEscape ?? undefined,
      );

      if (!result || result.code === code) return;
      return { code: result.code, map: result.map };
    },
  };
}
