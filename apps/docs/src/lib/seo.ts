import { fullUrl } from "@vincle/ssg";

import type { DocsRenderContext } from "./context.js";

import ssg from "../../ssg.config.js";
import { translatorFor } from "./i18n/interface.js";
import { localeFor, unlocalizedPath } from "./i18n/locale.js";
import { hasSocialCard, socialCardPath } from "./social-card.js";

export function getHeaders(page: DocsRenderContext) {
  const { config, meta, currentPage, alternates = [], hasMarkdownAlternate = false } = page;
  const locale = localeFor(currentPage);
  const t = translatorFor(locale);
  const card = !meta.image && !config.image && ssg.site !== undefined && hasSocialCard(currentPage);
  return {
    title: meta.title ? `${meta.title} - ${config.title}` : config.title,
    description: meta.description ?? (locale === "en" ? config.description : t("description")),
    keywords: meta.keywords?.length ? meta.keywords.join(", ") : null,
    image: card
      ? fullUrl(`/${socialCardPath(currentPage)}`, ssg.site!)
      : (meta.image ?? config.image),
    /** The generated card's size, which crawlers otherwise download the image to learn. */
    imageSize: card ? { width: 1200, height: 630 } : null,
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
