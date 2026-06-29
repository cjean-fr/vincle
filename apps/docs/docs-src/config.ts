import { Layout } from "./components/Layout.js";
import { JsxHandler } from "./handlers/jsx.js";
import { MarkdownHandler } from "./handlers/markdown.js";
import type {
  ResolvedDocsConfig,
  DocsConfig,
  HandlerEntry,
  TabConfig,
} from "./types.js";
import { readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULTS = {
  pages: "./docs-src/pages",
  examples: "./docs-src/examples",
  clientEntry: "docs-src/client.ts",
  out: "./dist",
  base: "/",
  viteManifest: "dist/assets/.vite/manifest.json",
} as const;

const DEFAULT_HANDLERS: Record<string, HandlerEntry> = {
  ".tsx": { handler: JsxHandler },
  ".jsx": { handler: JsxHandler },
  ".md": { handler: MarkdownHandler, prose: true },
};

export function defineConfig(config: DocsConfig): ResolvedDocsConfig {
  if (!config.title) {
    throw new Error("[@vincle/docs] defineConfig(): `title` is required.");
  }

  const handlers = { ...DEFAULT_HANDLERS, ...config.handlers };

  return {
    title: config.title,
    tagline: config.tagline ?? null,
    description: config.description ?? config.title,
    pages: config.pages ?? DEFAULTS.pages,
    examples: config.examples ?? DEFAULTS.examples,
    clientEntry: config.clientEntry ?? DEFAULTS.clientEntry,
    out: config.out ?? DEFAULTS.out,
    base: normalizeBase(config.base ?? DEFAULTS.base),
    viteManifest: config.viteManifest ?? DEFAULTS.viteManifest,
    sidebar: config.sidebar ?? "auto",
    tabs: resolveTabs(config),
    locale: config.locale ?? null,
    editUrl: config.editUrl ?? null,
    site: config.site ?? null,
    image: config.image ?? null,
    sitemap: config.sitemap !== false && Boolean(config.site),
    handlers,
    layout: config.layout ?? Layout,
  };
}

/**
 * Resolve the top-level tabs. When declared explicitly in config, they are
 * used as-is (validated). When omitted, tabs are auto-detected from the
 * immediate subdirectories of the pages root, each becoming a tab.
 */
function resolveTabs(config: DocsConfig): readonly TabConfig[] {
  if (config.tabs && config.tabs.length > 0) {
    const seen = new Set<string>();
    for (const tab of config.tabs) {
      if (!tab.slug) {
        throw new Error(
          "[@vincle/docs] defineConfig(): each tab requires a `slug`.",
        );
      }
      if (seen.has(tab.slug)) {
        throw new Error(
          `[@vincle/docs] defineConfig(): duplicate tab slug "${tab.slug}".`,
        );
      }
      seen.add(tab.slug);
    }
    return config.tabs;
  }

  const pagesDir = path.resolve(config.pages ?? DEFAULTS.pages);
  const tabs = autoDetectTabs(pagesDir);
  if (tabs.length === 0) {
    throw new Error(
      "[@vincle/docs] defineConfig(): no tabs configured and none could be auto-detected. Declare `tabs` or add content subdirectories.",
    );
  }
  return tabs;
}

function autoDetectTabs(pagesDir: string): TabConfig[] {
  if (!existsSync(pagesDir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(pagesDir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => {
      if (name.startsWith(".") || name.startsWith("_")) return false;
      const full = path.join(pagesDir, name);
      return existsSync(full) && statSync(full).isDirectory();
    })
    .map((name) => ({ label: titleCase(name), slug: name }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function titleCase(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function normalizeBase(base: string): string {
  if (!base.startsWith("/")) base = "/" + base;
  if (!base.endsWith("/")) base = base + "/";
  return base;
}
