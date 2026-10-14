import { Scope } from "@vincle/core";
import { loadViteManifest, setVite } from "@vincle/vite-plugin";
import { stat, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  build as buildVite,
  createServer,
  isRunnableDevEnvironment,
  mergeConfig,
  resolveConfig,
  type InlineConfig,
  type Plugin,
} from "vite";

import type { AssetIntegration, JsxRuntime } from "./types.js";

import { clientEntries } from "./conventions.js";
import { failure, diagnose } from "./errors.js";
import { flattenPlugins, loadViteConfig } from "./vite-config.js";

/** Assets and server pages share production configuration, aliases and plugins. */
export function viteAssets(config: InlineConfig = {}): AssetIntegration {
  return {
    prepare(context) {
      return diagnose(() => prepareVite(config, context), "Could not prepare Vite assets/pages", {
        reason: "ASSETS_FAILED",
        hint: "Check vite.config, entry files/imports and filesystem permissions. Inspect the original Vite error in cause.",
        context: { root: context.root, src: context.src, phase: "assets" },
      });
    },
  };
}

/** Keep the build-selected plugin set when using Vite's server module runner. */
async function productionPlugins(
  options: NonNullable<InlineConfig["plugins"]>,
  config: InlineConfig,
): Promise<Plugin[]> {
  const plugins: Plugin[] = [];
  for (const plugin of await flattenPlugins(options)) {
    if (plugin.apply === "serve") continue;
    if (
      typeof plugin.apply === "function" &&
      !plugin.apply(config, { command: "build", mode: config.mode ?? "production" })
    )
      continue;
    plugins.push({ ...plugin, apply: undefined });
  }
  return plugins;
}

async function prepareVite(
  config: InlineConfig,
  { root, src, out, runtime }: { root: string; src: string; out: string; runtime: JsxRuntime },
) {
  const mode = config.mode ?? "production";
  const user = await loadViteConfig(config, root, { command: "build", mode });
  const shared: InlineConfig = mergeConfig(user, {
    configFile: false,
    mode,
    root: user.root ? path.resolve(root, user.root) : root,
    // One runtime choice for the client and server source graphs.
    oxc: { jsx: { runtime: "automatic", importSource: runtime.importSource, development: false } },
    build: { outDir: out, emptyOutDir: true, manifest: true, write: true, copyPublicDir: false },
  });
  const resolved = await resolveConfig(shared, "build");
  let hasClientInput = Boolean(
    resolved.build.rolldownOptions.input || resolved.input || resolved.build.lib,
  );
  if (!hasClientInput) {
    const entries = await clientEntries(root, src);
    if (entries.length) {
      shared.build = {
        ...shared.build,
        // Keep user options, not resolved defaults: resolveConfig also resolves
        // the SSR environment, whose Node platform must not leak into clients.
        rolldownOptions: { ...shared.build?.rolldownOptions, input: entries },
      };
      hasClientInput = true;
    }
  }
  if (!hasClientInput) {
    try {
      hasClientInput = (await stat(path.join(resolved.root, "index.html"))).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (hasClientInput) await buildVite(shared);
  else await mkdir(out, { recursive: true });
  const manifest = hasClientInput
    ? await loadViteManifest(path.join(out, ".vite/manifest.json"))
    : {};
  if (!manifest)
    throw failure("Vite did not produce its asset manifest.", {
      reason: "ASSETS_FAILED",
      hint: "Ensure plugins do not disable/relocate build.manifest; .vite/manifest.json must exist in the preparation directory.",
      context: { root, manifest: path.join(out, ".vite/manifest.json") },
    });
  const sourceModules = await createViteModules(shared, user, runtime.importSource);
  return {
    directory: out,
    ...sourceModules,
    render(selected: JsxRuntime, create: () => unknown) {
      return Scope.with(() =>
        selected.render(() => {
          setVite(manifest, { base: resolved.base });
          return create();
        }),
      );
    },
  };
}

/** Reuse a Vite configuration with an already-built asset pipeline. */
export async function viteModules(config: InlineConfig = {}, importSource = "@vincle/core") {
  const root = path.resolve(config.root ?? process.cwd());
  const mode = config.mode ?? "production";
  return diagnose(
    async () => {
      const user = await loadViteConfig(config, root, { command: "build", mode });
      const shared: InlineConfig = mergeConfig(user, {
        configFile: false,
        root,
        mode,
        oxc: { jsx: { runtime: "automatic", importSource, development: false } },
      });
      return createViteModules(shared, user, importSource);
    },
    "Could not prepare Vite page modules",
    {
      reason: "COMPILATION_FAILED",
      hint: "Check the shared Vite configuration, aliases and plugins. Inspect the original cause.",
      context: { root, phase: "compile" },
    },
  );
}

async function createViteModules(shared: InlineConfig, user: InlineConfig, importSource: string) {
  const root = shared.root ?? process.cwd();
  const compiled = new Map<string, string>();
  const bridge: Plugin = {
    name: "vincle-ssg-modules",
    enforce: "pre",
    resolveId(id) {
      if (id.endsWith(".vincle-compiled.js") && compiled.has(id)) return id;
      return undefined;
    },
    load(id) {
      return compiled.get(id);
    },
  };
  const server = await createServer({
    ...shared,
    plugins: [bridge, ...(await productionPlugins(user.plugins ?? [], shared))],
    appType: "custom",
    server: { ...user.server, middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    environments: {
      ...user.environments,
      ssr: {
        ...user.environments?.["ssr"],
        resolve: {
          ...user.environments?.["ssr"]?.resolve,
          external: [
            "@vincle/core",
            "@vincle/core/jsx-runtime",
            "@vincle/core/jsx-dev-runtime",
            "@vincle/vite-plugin",
            "@vincle/ssg",
          ],
          conditions: [
            ...(user.environments?.["ssr"]?.resolve?.conditions ??
              user.ssr?.resolve?.conditions ?? ["node"]),
            ...("Bun" in globalThis ? ["bun"] : []),
          ],
          externalConditions: [
            ...(user.environments?.["ssr"]?.resolve?.externalConditions ??
              user.ssr?.resolve?.externalConditions ?? ["node"]),
            ...("Bun" in globalThis ? ["bun"] : []),
          ],
        },
      },
    },
    ssr: {
      ...user.ssr,
      external:
        user.ssr?.external === true
          ? true
          : [...(user.ssr?.external ?? []), "@vincle/core", "@vincle/vite-plugin", "@vincle/ssg"],
      resolve: {
        ...user.ssr?.resolve,
        externalConditions: [
          ...(user.ssr?.resolve?.externalConditions ?? ["node"]),
          ...("Bun" in globalThis ? ["bun"] : []),
        ],
      },
    },
  });
  try {
    const environment = server.environments["ssr"];
    if (!environment || !isRunnableDevEnvironment(environment))
      throw failure("Vite has no runnable server environment.", {
        reason: "ASSETS_FAILED",
        hint: "Keep a Node-compatible ssr environment, or provide a custom AssetIntegration with a ModuleLoader for your runtime.",
        context: { root },
      });
    return {
      modules: {
        async load(file: string, requestedSource: string, code?: string) {
          if (requestedSource !== importSource)
            throw failure("Source runtime differs from the prepared Vite runtime.", {
              reason: "INVALID_CONFIG",
              hint: "Use one runtime.importSource for the whole build, including pages and layouts.",
              context: { file, importSource: requestedSource, expected: importSource },
            });
          const id = code === undefined ? file : `${file}.vincle-compiled.js`;
          if (code !== undefined) compiled.set(id, code);
          return diagnose(
            () => environment.runner.import<Record<string, unknown>>(id),
            "Could not compile or evaluate Vite source",
            {
              reason: "COMPILATION_FAILED",
              hint: "Check source syntax/imports and the shared Vite aliases/plugins. Inspect the original module-runner error in cause.",
              context: { file, phase: "compile" },
            },
          );
        },
      },
      async dispose() {
        await server.close();
      },
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}
