import path from "node:path";

import type { ResolvedDocsConfig, DocsConfig, TabConfig } from "./types.js";

import { Layout } from "../components/Layout.js";

const ROOT = path.resolve(import.meta.dirname!, "../..");

const DEFAULTS = {
  pages: "./src/pages",
  clientEntry: "src/_client/main.ts",
  base: "/",
} as const;

export function defineConfig(config: DocsConfig): ResolvedDocsConfig {
  if (!config.title) {
    throw new Error("[@vincle/docs] defineConfig(): `title` is required.");
  }

  return {
    title: config.title,
    tagline: config.tagline ?? null,
    description: config.description ?? config.title,
    pages: path.resolve(ROOT, config.pages ?? DEFAULTS.pages),
    // No `path.resolve`: this value is a *Vite manifest key*, not a disk
    // path, and `<Asset entry>` looks it up as-is.
    clientEntry: config.clientEntry ?? DEFAULTS.clientEntry,
    base: normalizeBase(config.base ?? DEFAULTS.base),
    tabs: resolveTabs(config),
    editUrl: config.editUrl ?? null,
    site: config.site ?? null,
    image: config.image ?? null,
    sitemap: config.sitemap !== false && Boolean(config.site),
    handlers: config.handlers ?? {},
    layout: config.layout ?? Layout,
  };
}

/** Validate the documentation's explicitly configured navigation tabs. */
function resolveTabs(config: DocsConfig): readonly TabConfig[] {
  const seen = new Set<string>();
  for (const tab of config.tabs) {
    if (!tab.slug) {
      throw new Error("[@vincle/docs] defineConfig(): each tab requires a `slug`.");
    }
    if (seen.has(tab.slug)) {
      throw new Error(`[@vincle/docs] defineConfig(): duplicate tab slug "${tab.slug}".`);
    }
    seen.add(tab.slug);
  }
  return config.tabs;
}

function normalizeBase(base: string): string {
  if (!base.startsWith("/")) base = "/" + base;
  if (!base.endsWith("/")) base = base + "/";
  return base;
}
