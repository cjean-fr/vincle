import type { Page, PageMeta, ResolvedDocsConfig } from "../types.js";
import path from "node:path";

export function createPage(
  file: string,
  pagesDir: string,
  config: ResolvedDocsConfig,
  handlerName: string,
  rawMeta: unknown,
  Component: Page["Component"],
): Page {
  const rel = getRelativeRoute(file, pagesDir);
  const ext = path.extname(file);
  const route = rel.slice(0, -ext.length);
  const meta = normalizeMeta(rawMeta, rel);
  const url = meta.slug ?? routeToUrl(route);
  return {
    url,
    file,
    outPath: path.join(config.out, urlToOutPath(url)),
    handler: handlerName,
    meta,
    Component,
  };
}

export function routeToUrl(route: string): string {
  if (route === "index") return "/";
  if (route.endsWith("/index")) return "/" + route.slice(0, -"/index".length);
  return "/" + route;
}

export function urlToOutPath(url: string): string {
  if (url === "/") return "index.html";
  return url.replace(/^\//, "") + ".html";
}

export function normalizeMeta(raw: unknown, file: string): PageMeta {
  if (raw == null)
    throw new Error(`[@vincle/docs] ${file} is missing meta/frontmatter.`);
  if (typeof raw !== "object")
    throw new Error(`[@vincle/docs] ${file}: meta must be an object.`);
  const meta = raw as PageMeta;
  if (typeof meta.title !== "string" || meta.title.length === 0) {
    throw new Error(`[@vincle/docs] ${file}: title is required.`);
  }
  return meta;
}

export function getRelativeRoute(file: string, pagesDir: string): string {
  return path.relative(pagesDir, file).replace(/\\/g, "/");
}
