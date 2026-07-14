import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import type { ResolvedDocsConfig, Page, HandlerEntry } from "../types.js";

export async function discoverPages(config: ResolvedDocsConfig): Promise<Page[]> {
  const pagesDir = path.resolve(config.pages);
  const handlers = config.handlers;
  const extensions = Object.keys(handlers);
  const found = await walk(pagesDir, extensions);
  const pages: Page[] = [];
  for (const file of found) {
    pages.push(await loadFile(file, pagesDir, config, handlers));
  }
  pages.sort((a, b) => a.url.localeCompare(b.url));
  return pages;
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

export function findPageFile(config: ResolvedDocsConfig, url: string): string | null {
  const pagesDir = path.resolve(config.pages);
  const extensions = Object.keys(config.handlers);
  let route = url.replace(/^\//, "") || "index";
  if (route.endsWith(".html")) route = route.slice(0, -".html".length);
  if (route.endsWith("/")) route = route + "index";
  for (const base of [route, `${route}/index`]) {
    for (const ext of extensions) {
      const candidate = path.join(pagesDir, base + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function walk(dir: string, extensions: string[]): Promise<string[]> {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".compiled") continue;
      out.push(...(await walk(fullPath, extensions)));
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(fullPath);
    }
  }
  return out;
}
