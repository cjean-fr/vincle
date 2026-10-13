import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadConfigFromFile,
  mergeConfig,
  type ConfigEnv,
  type InlineConfig,
  type Plugin,
  type PluginOption,
} from "vite";

export async function flattenPlugins(options: readonly PluginOption[]): Promise<Plugin[]> {
  const plugins: Plugin[] = [];
  for (const option of options) {
    const plugin = await option;
    if (Array.isArray(plugin)) plugins.push(...(await flattenPlugins(plugin)));
    else if (plugin) plugins.push(plugin);
  }
  return plugins;
}

/** Use the project's installed standard plugin, preserving explicitly configured instances. */
async function withTailwind(config: InlineConfig, root: string): Promise<InlineConfig> {
  const plugins = await flattenPlugins(config.plugins ?? []);
  if (plugins.some((plugin) => plugin.name.startsWith("@tailwindcss/vite"))) return config;
  const resolve = createRequire(path.join(root, "package.json")).resolve;
  let entry: string;
  try {
    entry = resolve("@tailwindcss/vite");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") return config;
    throw error;
  }
  const module = (await import(/* @vite-ignore */ pathToFileURL(entry).href)) as {
    default(): Plugin[];
  };
  return { ...config, plugins: [...(config.plugins ?? []), ...module.default()] };
}

/** Shared project configuration for assets, page modules and the dev server. */
export async function loadViteConfig(
  config: InlineConfig,
  root: string,
  env: ConfigEnv,
): Promise<InlineConfig> {
  const loaded =
    config.configFile === false
      ? undefined
      : await loadConfigFromFile(
          env,
          typeof config.configFile === "string" ? path.resolve(root, config.configFile) : undefined,
          root,
          config.logLevel,
        );
  const merged: InlineConfig = mergeConfig(loaded?.config ?? {}, config);
  // Vite's merge skips null, which explicitly disables file watching.
  if (config.server?.watch === null) merged.server = { ...merged.server, watch: null };
  return withTailwind(merged, root);
}
