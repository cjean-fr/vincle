import { fullUrl } from "@vincle/ssg";

import type { DocsRenderContext } from "./context.js";

import ssg from "../../ssg.config.js";
import { hasSocialCard, socialCardPath } from "./social-card.js";

export function getHeaders(page: DocsRenderContext) {
  const { config, meta, currentPage, hasMarkdownAlternate = false } = page;
  const card = !meta.image && ssg.site !== undefined && hasSocialCard(currentPage);
  return {
    title: meta.title ? `${meta.title} - ${config.title}` : config.title,
    description: meta.description ?? config.description,
    keywords: meta.keywords?.length ? meta.keywords.join(", ") : null,
    image: card ? fullUrl(`/${socialCardPath(currentPage)}`, ssg.site!) : meta.image,
    /** The generated card's size, which crawlers otherwise download the image to learn. */
    imageSize: card ? { width: 1200, height: 630 } : null,
    canonical: ssg.site ? fullUrl(currentPage, ssg.site) : null,
    isErrorPage: currentPage === "/404",
    currentPage,
    hasMarkdownAlternate,
  };
}

export function getStructuredData(page: DocsRenderContext) {
  const { title, description, isErrorPage } = getHeaders(page);
  if (!ssg.site || isErrorPage) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: title,
    description,
    url: fullUrl("/", ssg.site),
    inLanguage: "en",
  };
}

/**
 * The page's place in the site: Home, its tab, then the page itself.
 *
 * Only destinations that exist are listed. The tab links where its tab link
 * goes (its first page); sidebar categories have no page of their own, so they
 * stay out. On the tab's first page the tab and the page are one, so the trail
 * is Home and that page. Pages outside any tab (home, privacy) have no
 * hierarchy to declare.
 */
export function getBreadcrumbData(page: DocsRenderContext) {
  const { config, meta, currentPage, currentTab, resolvedTabs } = page;
  if (!ssg.site || currentPage === "/404" || !currentTab || !meta.title) return undefined;
  const tab = resolvedTabs.find((candidate) => candidate.slug === currentTab.slug);
  const trail = [
    { name: config.title, url: "/" },
    ...(tab && tab.href !== currentPage ? [{ name: tab.label, url: tab.href }] : []),
    { name: meta.title, url: currentPage },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: fullUrl(step.url, ssg.site!),
    })),
  };
}
