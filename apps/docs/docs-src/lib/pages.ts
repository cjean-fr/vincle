import { discoverPages as discoverSitePages, type ModuleLoader } from "@vincle/ssg";

import type { ResolvedDocsConfig, Page } from "../types.js";

import { createPage } from "./page-utils.js";
import { isPublished } from "./publication-date.js";

export async function discoverPages(
  config: ResolvedDocsConfig,
  now = new Date(),
  modules?: ModuleLoader,
): Promise<Page[]> {
  const pages = await discoverSitePages({
    src: config.pages,
    modules,
    handlers: Object.fromEntries(
      Object.entries(config.handlers).map(([extension, entry]) => [extension, entry.handler]),
    ),
    excludeDirectories: [".compiled"],
  });
  const published = pages
    .map((page) => createPage(page, config))
    .filter((page) => isPublished(page.meta, now));
  published.sort((a, b) => a.url.localeCompare(b.url));
  return published;
}
