import type { Plugin, ResolvedConfig } from "vite";

import { parseSync } from "oxc-parser";

import type { AnyNode } from "./types.js";

import { assertRuntimeSource } from "./config.js";
import { RUNTIME_SOURCE } from "./core/index.js";
import { hasJsx } from "./emit.js";
import precompileTransform, {
  type PluginConfig,
  type RenderAttr,
  type RenderEscape,
} from "./index.js";
import { declaredRuntimeHelpers } from "./runtime-helpers.js";

export type { PluginConfig };

/**
 * Virtual module ID that re-exports the three precompile runtime helpers
 * (jsxTemplate, jsxAttr, jsxEscape). Users never need to create a physical
 * adapter file: the plugin provides this module automatically when no
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

/**
 * Vite 8 is the first release with an `oxc` option. Older resolved configs have
 * no `oxc` key at all, and the esbuild field is then the only one that reaches
 * the compiler.
 */
interface LegacyResolvedConfig {
  oxc?: undefined;
  esbuild?: { jsxImportSource?: string } | false;
}

/**
 * The JSX import source the compiler will actually use, read from Vite's own
 * resolved configuration: a converted `esbuild.jsxImportSource` already lives
 * in `oxc.jsx` on Vite 8, and reading the deprecated field there would pick a
 * source the compiler ignores. `classic`, `preserve`, a disabled transform and
 * an empty source leave no runtime to detect.
 */
function configuredImportSource(resolved: ResolvedConfig): string | undefined {
  if ("oxc" in resolved) {
    const oxc = resolved.oxc;
    if (!oxc) return undefined;
    const jsx = oxc.jsx;
    if (jsx === undefined || jsx === "preserve") return undefined;
    if (jsx.runtime === "classic") return undefined;
    return jsx.importSource || undefined;
  }
  const esbuild = (resolved as LegacyResolvedConfig).esbuild;
  if (!esbuild) return undefined;
  return esbuild.jsxImportSource || undefined;
}

/**
 * A component at the root stays JSX, so the transform returns null for it even
 * though the module genuinely carries JSX. Only called in that already
 * exceptional case, never on the fast path.
 */
function containsJsx(code: string, id: string): boolean {
  const lang = id.endsWith(".tsx") ? "tsx" : "jsx";
  const result = parseSync(id, code, {
    lang,
    sourceType: "unambiguous",
    range: true,
    preserveParens: false,
  });
  return hasJsx(result.program as unknown as AnyNode);
}

export default function vitePrecompile(config?: PluginConfig): Plugin {
  assertRuntimeSource(config);
  const explicitRuntimeSource = config?.runtimeSource;

  let runtimeSourceForTransform: string = VIRTUAL_MODULE_ID;
  let renderAttr: RenderAttr | null = null;
  /**
   * The runtime's `jsxEscape`, loaded at build time: static text is then
   * escaped by the target runtime's own rules, which is what makes a
   * precompiled page byte-identical to the dynamic one. Null for a runtime
   * that does not declare the `"vincle"` dialect, and for a runtime this build
   * cannot load: the transform then emits Deno's output.
   */
  let renderEscape: RenderEscape | null = null;

  /**
   * When jsxImportSource is set, this holds the candidate path
   * ("{source}/jsx-runtime") so buildStart can probe it at build time.
   * If the probe finds jsxTemplate the virtual module re-exports from
   * there; otherwise it falls back to RUNTIME_SOURCE.
   */
  let candidateFrameworkRuntime: string | null = null;

  /**
   * The actual module that the virtual module re-exports from.  Set
   * during buildStart: either the framework's runtime (when the probe
   * succeeds) or @vincle/core/jsx-precompile-runtime.
   *
   * When runtimeSource is explicit, the virtual module is not involved
   * and this field is unused; the build-time load reads explicitRuntimeSource
   * first.
   */
  let resolvedRuntimeSource: string = RUNTIME_SOURCE;

  /**
   * What this build actually handed to the plugin.
   *
   * A precompiled module and a runtime-rendered one emit the same bytes, so a
   * build where the transform never runs is indistinguishable from one where it
   * did: except in speed, which nobody measures on their own page. These three
   * counters are what turns that silence into a warning at `buildEnd`.
   */
  let modulesSeen = 0;
  let jsxFileModules = 0;
  let jsxModulesSeen = 0;
  let transformedCount = 0;
  let isBuild = false;

  return {
    name: "@vincle/precompile",
    enforce: "pre",

    configResolved(resolvedConfig: ResolvedConfig) {
      isBuild = resolvedConfig.command === "build";
      if (explicitRuntimeSource) {
        runtimeSourceForTransform = explicitRuntimeSource;
        return;
      }

      runtimeSourceForTransform = VIRTUAL_MODULE_ID;

      const jsxImportSource = configuredImportSource(resolvedConfig);
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
        return `export * from "${resolvedRuntimeSource}";`;
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
        // does not: the probe throws a clear build error.
        let mod: Record<string, unknown>;
        try {
          mod = (await import(/* @vite-ignore */ candidateFrameworkRuntime)) as Record<
            string,
            unknown
          >;
        } catch (err) {
          this.error(
            `[vincle/precompile] failed to probe ${candidateFrameworkRuntime}: ${String(err)}. ` +
              `The module for jsxImportSource "${candidateFrameworkRuntime.replace(FRAMEWORK_RUNTIME_SUFFIX, "")}" ` +
              "could not be imported: is it installed and resolvable from where Vite runs? " +
              "Or set an explicit runtimeSource.",
          );
        }
        if (typeof mod["jsxTemplate"] !== "function") {
          this.error(
            `[vincle/precompile] jsxImportSource "${candidateFrameworkRuntime.replace(FRAMEWORK_RUNTIME_SUFFIX, "")}" ` +
              'does not support the precompile transform: its jsx-runtime has no "jsxTemplate" export. ' +
              "Use Preact, Hono, or @vincle/core, or set an explicit runtimeSource to a module that " +
              "exports jsxTemplate, jsxAttr and jsxEscape.",
          );
        }
        resolvedRuntimeSource = candidateFrameworkRuntime;
      }

      // Which output the transform emits is decided by the runtime, not by an
      // option: a runtime that declares the `"vincle"` precompile dialect gets
      // the corrected, sanitized output, because it is the one that promises a
      // precompiled page renders the same bytes as a dynamic one. Any other,
      // Preact, Hono, an adapter that re-exports only the three helpers: gets
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
        // an error: the generated code imports the helpers itself, and a
        // module Vite can resolve but this build cannot is a normal setup.
        this.warn(
          `[vincle/precompile] could not load "${source}" at build time ` +
            `(${String(err)}), so the output follows Deno's precompile transform. Static ` +
            "attributes are inlined without URL or CSS filtering.",
        );
        return;
      }

      let helpers;
      try {
        helpers = declaredRuntimeHelpers(mod, source);
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error));
      }
      renderAttr = helpers?.jsxAttr ?? null;
      renderEscape = helpers?.jsxEscape ?? null;
    },

    transform(code: string, id: string) {
      modulesSeen++;
      if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return;
      if (id.includes("node_modules")) return;
      jsxFileModules++;
      if (!code.includes("<")) return;

      const result = precompileTransform(
        code,
        id,
        { runtimeSource: runtimeSourceForTransform },
        renderAttr ?? undefined,
        renderEscape ?? undefined,
      );

      // The transform returns null for a `.tsx` that carries only a less-than
      // operator or a "<" in a string, and for a component at the root, which
      // it leaves as JSX. Counting the extension itself made the first case
      // fail a build that had no JSX to compile; the parse distinguishes it
      // from the second, where the runtime is genuinely missing.
      if (!result) {
        if (containsJsx(code, id)) jsxModulesSeen++;
        return;
      }
      jsxModulesSeen++;
      if (result.code === code) return;
      transformedCount++;
      return { code: result.code, map: result.map };
    },

    /**
     * Declared and never used is a real configuration, and a silent one: the
     * transform is byte-for-byte equivalent to the runtime path, so a build that
     * skipped it renders the same document, only slower. Whoever put the plugin
     * in the config believes it is working.
     *
     * Build only. In dev this hook fires when the server closes, where a warning
     * about the modules it did not see reads as an error at shutdown.
     */
    buildEnd() {
      if (!isBuild) return;
      if (jsxModulesSeen > 0 && !explicitRuntimeSource && !candidateFrameworkRuntime) {
        this.error(
          "[vincle/precompile] no JSX runtime source was detected. " +
            "Set runtimeSource explicitly or configure oxc.jsx.importSource (Vite 8) " +
            "or esbuild.jsxImportSource (Vite 5-7). tsconfig jsxImportSource alone " +
            "is not exposed by Vite config resolution.",
        );
      }
      if (transformedCount > 0) return;

      const detail =
        jsxModulesSeen > 0
          ? `${jsxModulesSeen} .jsx/.tsx module(s) contained JSX it did not precompile`
          : jsxFileModules > 0
            ? `${jsxFileModules} .jsx/.tsx module(s) passed through it, none carrying JSX to precompile`
            : `no .jsx/.tsx module passed through it at all (${modulesSeen} module(s) seen)`;

      this.warn(
        `[vincle/precompile] nothing was precompiled in this build: ${detail}. ` +
          "A page rendered by an SSG, or by a server that imports its own modules, never " +
          "reaches a Vite plugin, and since the transform emits byte-identical output, speed " +
          "is the only thing that would have told you. If this build is not the one that " +
          "renders your JSX, drop the plugin from it.",
      );
    },
  };
}
