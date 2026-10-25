import {
  discoverPages as discoverSitePages,
  type ModuleLoader,
  type DiscoverPagesOptions,
  type DiscoveredPage,
} from "@vincle/ssg";

import type { ResolvedDocsConfig, Page, PageMeta } from "./types.js";

import { markdownPath } from "./url.js";

export async function discoverPages(
  config: ResolvedDocsConfig,
  now = new Date(),
  modules?: ModuleLoader,
  discover: (options: DiscoverPagesOptions) => Promise<DiscoveredPage[]> = discoverSitePages,
): Promise<Page[]> {
  const pages = await discover({
    src: config.pages,
    modules,
    handlers: config.handlers,
  });
  const published = pages.map(createPage).filter((page) => isPublished(page.meta, now));
  published.sort((a, b) => a.url.localeCompare(b.url));
  return published;
}

function createPage(page: DiscoveredPage): Page {
  const { source } = page;
  const meta = normalizeMeta(page.meta, source.relativePath);
  const url = meta.slug ?? source.route;
  return {
    ...page,
    url,
    file: source.file,
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
  const keywords = normalizeKeywords(meta.keywords, file);
  return {
    ...meta,
    ...(published_at === undefined ? {} : { published_at }),
    ...(keywords === undefined ? {} : { keywords }),
  };
}

/**
 * Search keywords as a trimmed, de-duplicated list. Frontmatter may give a YAML
 * list or a comma-separated string; an empty result is the same as no keywords.
 */
export function normalizeKeywords(value: unknown, file: string): string[] | undefined {
  if (value === undefined) return undefined;
  const items = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(items) || items.some((item) => typeof item !== "string")) {
    throw new Error(
      `[@vincle/docs] ${file}: keywords must be a list of strings or a comma-separated string.`,
    );
  }
  const keywords = [...new Set(items.map((item: string) => item.trim()).filter(Boolean))];
  return keywords.length === 0 ? undefined : keywords;
}

const ISO_DATE =
  /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/;

/** YAML dates may arrive as Date objects; metadata always exposes ISO strings. */
export function normalizePublicationDate(value: unknown, file: string): string | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string") {
    const match = ISO_DATE.exec(value);
    if (match) {
      const day = new Date(`${match[1]}T00:00:00.000Z`);
      if (
        Number.isFinite(day.getTime()) &&
        day.toISOString().slice(0, 10) === match[1] &&
        Number.isFinite(Date.parse(value))
      )
        return value;
    }
  }
  throw new Error(
    `[@vincle/docs] ${file}: published_at must be an ISO date (YYYY-MM-DD) or timestamp with a timezone.`,
  );
}

/** Date-only values start at midnight UTC; timestamps use their explicit offset. */
export function isPublished(meta: Pick<PageMeta, "published_at">, now: Date): boolean {
  return meta.published_at === undefined || Date.parse(meta.published_at) <= now.getTime();
}
