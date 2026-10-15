import path from "node:path";

import type { ResolvedDocsConfig, DocsConfig } from "./types.js";

import { Layout } from "../components/Layout.js";

const ROOT = path.resolve(import.meta.dirname!, "../..");

export function defineConfig(config: DocsConfig): ResolvedDocsConfig {
  if (!config.title) {
    throw new Error("[@vincle/docs] defineConfig(): `title` is required.");
  }

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

  return {
    title: config.title,
    tagline: config.tagline ?? null,
    description: config.description ?? config.title,
    pages: path.resolve(ROOT, config.pages ?? "./src/pages"),
    // No `path.resolve`: this value is a *Vite manifest key*, not a disk
    // path, and `<Asset entry>` looks it up as-is.
    clientEntry: config.clientEntry ?? "src/_client/main.ts",
    tabs: config.tabs,
    editUrl: config.editUrl ?? null,
    image: config.image ?? null,
    handlers: config.handlers ?? {},
    layout: config.layout ?? Layout,
  };
}
