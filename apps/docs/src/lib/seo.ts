import type { DocsRenderContext } from "./context.js";

import { fullUrl } from "./full-url.js";
import { translatorFor } from "./i18n/interface.js";
import { localeFor, unlocalizedPath } from "./i18n/locale.js";

/** Schema.org type currently emitted by the documentation. */
interface WebSite {
  "@context": "https://schema.org";
  "@type": "WebSite";
  name: string;
  description: string;
  url: string;
  inLanguage: string;
}

export function getHeaders(page: DocsRenderContext) {
  const { config, meta, currentPage, alternates = [], hasMarkdownAlternate = false } = page;
  const locale = localeFor(currentPage);
  const t = translatorFor(locale);
  return {
    title: meta.title ? `${meta.title} - ${config.title}` : config.title,
    description: meta.description ?? (locale === "en" ? config.description : t("description")),
    image: meta.image ?? config.image,
    canonical: config.site ? fullUrl(currentPage, config.site, config.base) : null,
    isErrorPage: unlocalizedPath(currentPage) === "/404",
    config,
    locale,
    alternates,
    currentPage,
    hasMarkdownAlternate,
  };
}

export function getStructuredData(page: DocsRenderContext): WebSite | undefined {
  const { config, title, description, locale, isErrorPage } = getHeaders(page);
  if (!config.site || isErrorPage) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: title,
    description,
    url: fullUrl("/", config.site, config.base),
    inLanguage: locale,
  };
}
