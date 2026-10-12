import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import type { ResolvedDocsConfig, Page, HandlerEntry } from "../types.js";

import { mapConcurrent } from "./concurrent.js";
import { isPublished } from "./publication-date.js";

export async function discoverPages(config: ResolvedDocsConfig, now = new Date()): Promise<Page[]> {
  const pagesDir = path.resolve(config.pages);
  const handlers = config.handlers;
  const extensions = Object.keys(handlers);
  const found = await walk(pagesDir, extensions);
  const pages = await mapConcurrent(
    found,
    (file) => loadFile(file, pagesDir, config, handlers),
    16,
  );
  const published = pages.filter((page) => isPublished(page.meta, now));
  published.sort((a, b) => a.url.localeCompare(b.url));
  return published;
}

async function loadFile(
  file: string,
  pagesDir: string,
  config: ResolvedDocsConfig,
  handlers: Record<string, HandlerEntry>,
): Promise<Page> {
  const ext = path.extname(file);
  const entry = handlers[ext];
  if (entry) {
    return entry.handler.load(file, pagesDir, config);
  }
  throw new Error(`[@vincle/docs] No handler configured for "${ext}" files (${file}).`);
}

async function walk(dir: string, extensions: string[]): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".compiled") return [];
        return walk(fullPath, extensions);
      }
      if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        return [fullPath];
      }
      return [];
    }),
  );
  return results.flat();
}
