import type { DiscoverPagesOptions, DiscoveredPage, PageContext, SsgOptions } from "@vincle/ssg";

import { createHash } from "node:crypto";
import path from "node:path";

import type { DocsRenderContext } from "./context.js";
import type { Page } from "./types.js";

import config from "../../docs.config.js";
import { translatorFor } from "./i18n/interface.js";
import {
  localeFor,
  localizedPath,
  translationAlternates,
  type Locale,
  unlocalizedPath,
} from "./i18n/locale.js";
import { editUrlFor, lastModified } from "./page-history.js";
import { discoverPages } from "./pages.js";
import {
  resolveSidebar,
  resolveNavigation,
  clearMetaCache,
  readDirMeta,
  firstPageOfTab,
  tabFor,
} from "./sidebar.js";

const documentationLocales = ["en"] as readonly Locale[];

interface Navigation {
  key: string;
  forPage(page: Page): Promise<DocsRenderContext>;
}
let navigationSnapshot: Navigation | undefined;

/** Equal catalogs share a snapshot; changed catalogs never overwrite existing contexts. */
async function documentationContexts(pages: Page[]): Promise<Navigation> {
  const configuration = { ...config };
  const siteLastUpdated = pages.some((page) => page.url === "/")
    ? await lastModified(configuration.pages)
    : null;
  const tabsByLocale: Record<Locale, { label: string; slug: string; href: string }[]> = {
    en: [],
    fr: [],
  };
  const published = pages.filter((page) => !page.meta.draft);
  if (new Set(published.map((page) => page.url)).size !== published.length) {
    throw new Error("[@vincle/docs] duplicate page URLs detected.");
  }
  for (const locale of documentationLocales) {
    const t = translatorFor(locale);
    tabsByLocale[locale] = await Promise.all(
      configuration.tabs.map(async (tab) => ({
        label:
          tab.slug === "guide" || tab.slug === "integration" || tab.slug === "api"
            ? t(tab.slug)
            : tab.label,
        slug: tab.slug,
        href: tab.href
          ? localizedPath(tab.href, locale)
          : await firstPageOfTab(configuration, pages, tab, locale),
      })),
    );
  }
  const available = new Set(published.map((page) => page.url));
  const root = path.resolve(configuration.pages);
  const directories = new Set<string>([root]);
  for (const page of pages) {
    for (let dir = path.dirname(page.file); dir !== root; dir = path.dirname(dir)) {
      directories.add(dir);
    }
  }
  const navigation = await Promise.all(
    [...directories]
      .toSorted()
      .map(async (dir) => [path.join(dir, "_meta.json"), await readDirMeta(dir)] as const),
  );
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        configuration,
        pages: pages.map((page) => [page.file, page.url, page.meta]),
        navigation,
        siteLastUpdated,
      }),
    )
    .digest("hex");
  if (navigationSnapshot?.key === key) return navigationSnapshot;
  return (navigationSnapshot = {
    key,
    forPage: async (page: Page) => {
      const locale = localeFor(page.url);
      const sidebar = await resolveSidebar(configuration, pages, page.url);
      const { prev, next } = resolveNavigation(sidebar, page.url);
      return {
        config: configuration,
        currentPage: page.url,
        hasMarkdownAlternate: page.file.endsWith(".mdx"),
        meta: page.meta,
        sidebar,
        currentTab: tabFor(configuration.tabs, page.url),
        resolvedTabs: tabsByLocale[locale],
        alternates: translationAlternates(page.url, available),
        lastUpdated: page.url === "/" ? siteLastUpdated : null,
        editUrl: editUrlFor(configuration.editUrl, page.file),
        prev,
        next,
      };
    },
  });
}

/** Documentation pages carry their navigation context to the layout. */
export async function discoverDocumentation(
  options: DiscoverPagesOptions,
  discover?: Parameters<NonNullable<SsgOptions["discover"]>>[1],
): Promise<DiscoveredPage[]> {
  clearMetaCache();
  const allPages = await discoverPages(config, new Date(), options.modules, discover);
  const navigation = await documentationContexts(allPages);
  const pagesDirectory = path.resolve(config.pages);
  return allPages.map((page) => {
    const extension = path.extname(page.file);
    return Object.assign({}, page, {
      source: { ...page.source, runtime: options.runtime ?? page.source.runtime },
      meta: {
        ...page.meta,
        locale: localeFor(page.url),
        translationKey: unlocalizedPath(page.url),
        documentation: () => navigation.forPage(page),
        prose: page.meta.prose ?? (extension === ".mdx" || extension === ".md"),
        renderKey: navigation.key,
      },
      render(context: PageContext) {
        for (let dir = path.dirname(page.file); ; dir = path.dirname(dir)) {
          context.watch(path.join(dir, "_meta.json"));
          if (dir === pagesDirectory) break;
        }
        context.watch(pagesDirectory);
        context.watch(path.resolve("docs.config.ts"));
        context.watch(path.resolve("public/.well-known"));
        return page.render(context);
      },
    });
  });
}

export { documentationArtifacts } from "./publication.js";
