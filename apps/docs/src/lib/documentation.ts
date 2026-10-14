import type {
  DiscoverPagesOptions,
  DiscoveredPage,
  PageContext,
  PublicationContext,
  SsgPlugin,
} from "@vincle/ssg";

import path from "node:path";

import type { Page } from "./types.js";

import config from "../../docs.config.js";
import { htmlToText } from "./html-text.js";
import { translatorFor } from "./i18n/interface.js";
import {
  localeFor,
  localizedPath,
  translationAlternates,
  type Locale,
  unlocalizedPath,
} from "./i18n/locale.js";
import { llmsFullTxt, llmsTxt } from "./llms.js";
import { editUrlFor, lastModified } from "./page-history.js";
import { discoverPages } from "./pages.js";
import {
  resolveSidebar,
  resolveNavigation,
  clearMetaCache,
  firstPageOfTab,
  tabFor,
} from "./sidebar.js";

const documentationLocales = ["en"] as readonly Locale[];

/** Each discovery owns its navigation state; successive builds cannot overwrite it. */
async function documentationContexts(pages: Page[]) {
  const siteLastUpdated = pages.some((page) => page.url === "/")
    ? await lastModified(config.pages)
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
      config.tabs.map(async (tab) => ({
        label:
          tab.slug === "guide" || tab.slug === "integration" || tab.slug === "api"
            ? t(tab.slug)
            : tab.label,
        slug: tab.slug,
        href: tab.href
          ? localizedPath(tab.href, locale)
          : await firstPageOfTab(config, pages, tab, locale),
      })),
    );
  }
  const available = new Set(published.map((page) => page.url));
  return async (page: Page) => {
    const locale = localeFor(page.url);
    const sidebar = await resolveSidebar(config, pages, page.url);
    const { prev, next } = resolveNavigation(sidebar, page.url);
    return {
      config,
      currentPage: page.url,
      hasMarkdownAlternate: page.file.endsWith(".mdx"),
      meta: page.meta,
      sidebar,
      currentTab: tabFor(config.tabs, page.url),
      resolvedTabs: tabsByLocale[locale],
      alternates: translationAlternates(page.url, available),
      lastUpdated: page.url === "/" ? siteLastUpdated : null,
      editUrl: editUrlFor(config.editUrl, page.file),
      prev,
      next,
    };
  };
}

/** Documentation pages carry their navigation context to the layout. */
export async function discoverDocumentation(
  options: DiscoverPagesOptions,
): Promise<DiscoveredPage[]> {
  clearMetaCache();
  const allPages = await discoverPages(config, new Date(), options.modules);
  const contextFor = await documentationContexts(allPages);
  return allPages.map((page) => {
    const extension = path.extname(page.file);
    return Object.assign({}, page, {
      source: { ...page.source, runtime: options.runtime ?? page.source.runtime },
      meta: {
        ...page.meta,
        locale: localeFor(page.url),
        translationKey: unlocalizedPath(page.url),
        documentation: () => contextFor(page),
        prose: page.meta.prose ?? (extension === ".mdx" || extension === ".md"),
        incremental: false,
      },
      render(context: PageContext) {
        context.watch(config.pages);
        context.watch(path.resolve("docs.config.ts"));
        context.watch(path.resolve("public/.well-known"));
        return page.render(context);
      },
    });
  });
}

/** llms.txt and llms-full.txt need every rendered page. */
export const documentationArtifacts: SsgPlugin = {
  name: "documentation-artifacts",
  async publish(context: PublicationContext) {
    const rendered = context.outputs
      .filter((output) => output.meta.search !== false)
      .map((output) => ({
        url: output.url,
        title: output.meta.title ?? output.url,
        read: () => output.read(),
      }));
    for (const locale of documentationLocales) {
      const pages = rendered.filter((page) => localeFor(page.url) === locale);
      const prefix = locale === "en" ? "" : `${locale}/`;
      const localeConfig =
        locale === "en" ? config : { ...config, description: translatorFor(locale)("description") };
      await context.emit({
        path: `${prefix}llms.txt`,
        content: llmsTxt(pages, localeConfig, locale),
      });
      await context.emit({
        path: `${prefix}llms-full.txt`,
        content: () =>
          llmsFullTxt(
            (async function* () {
              for (const page of pages)
                yield { url: page.url, title: page.title, text: htmlToText(await page.read()) };
            })(),
            localeConfig,
            locale,
          ),
      });
    }
  },
};
