import { fullUrl } from "@vincle/ssg";

import type { DocsRenderContext } from "./context.js";

import ssg from "../../ssg.config.js";
import { translatorFor } from "./i18n/interface.js";
import { localeFor, unlocalizedPath } from "./i18n/locale.js";

export function getHeaders(page: DocsRenderContext) {
  const { config, meta, currentPage, alternates = [], hasMarkdownAlternate = false } = page;
  const locale = localeFor(currentPage);
  const t = translatorFor(locale);
  return {
    title: meta.title ? `${meta.title} - ${config.title}` : config.title,
    description: meta.description ?? (locale === "en" ? config.description : t("description")),
    image: meta.image ?? config.image,
    canonical: ssg.site ? fullUrl(currentPage, ssg.site) : null,
    isErrorPage: unlocalizedPath(currentPage) === "/404",
    locale,
    alternates,
    currentPage,
    hasMarkdownAlternate,
  };
}

export function getStructuredData(page: DocsRenderContext) {
  const { title, description, locale, isErrorPage } = getHeaders(page);
  if (!ssg.site || isErrorPage) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: title,
    description,
    url: fullUrl("/", ssg.site),
    inLanguage: locale,
  };
}
