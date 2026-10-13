import type { DiscoveredPage } from "@vincle/ssg";

import path from "node:path";

import type { Page, PageMeta, ResolvedDocsConfig } from "../types.js";

import { markdownPath } from "../i18n/locale.js";
import { normalizePublicationDate } from "./publication-date.js";

export function createPage(page: DiscoveredPage, config: ResolvedDocsConfig): Page {
  const { source } = page;
  const meta = normalizeMeta(page.meta, source.relativePath);
  const url = meta.slug ?? source.route;
  return {
    ...page,
    url,
    file: source.file,
    outPath: path.join(config.out, urlToOutPath(url)),
    meta,
    source: {
      ...source,
      route: url,
      outputPath: (extension = ".html") =>
        extension === ".html"
          ? urlToOutPath(url)
          : extension === ".md"
            ? markdownPath(url).slice(1)
            : `${url === "/" ? "index" : url.slice(1)}${extension}`,
    },
  };
}

function urlToOutPath(url: string): string {
  if (url === "/") return "index.html";
  return url.replace(/^\//, "") + ".html";
}

function normalizeMeta(raw: unknown, file: string): PageMeta {
  if (raw == null) throw new Error(`[@vincle/docs] ${file} is missing meta/frontmatter.`);
  if (typeof raw !== "object") throw new Error(`[@vincle/docs] ${file}: meta must be an object.`);
  const meta = raw as PageMeta;
  if (typeof meta.title !== "string" || meta.title.length === 0) {
    throw new Error(`[@vincle/docs] ${file}: title is required.`);
  }
  const published_at = normalizePublicationDate(meta.published_at, file);
  return {
    ...meta,
    ...(published_at === undefined ? {} : { published_at }),
  };
}

export function getRelativeRoute(file: string, pagesDir: string): string {
  return path.relative(pagesDir, file).replace(/\\/g, "/");
}
