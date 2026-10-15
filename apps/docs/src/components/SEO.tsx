import { fullUrl } from "@vincle/ssg";

import type { DocsRenderContext } from "../lib/context.js";

import ssg from "../../ssg.config.js";
import { markdownPath } from "../lib/i18n/locale.js";
import { getHeaders, getStructuredData } from "../lib/seo.js";

type SEOProps = { page: DocsRenderContext };

export function SEOHeader({ page }: SEOProps) {
  const {
    title,
    description,
    canonical,
    image,
    locale,
    isErrorPage,
    alternates,
    currentPage,
    hasMarkdownAlternate,
  } = getHeaders(page);
  return (
    <>
      {isErrorPage && <meta name="robots" content="noindex" />}
      {/* One icon only, because `public/` holds just the one. */}
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      {canonical && !isErrorPage && <link rel="canonical" href={canonical} />}
      {ssg.site &&
        !isErrorPage &&
        alternates.map(({ locale: language, href }) => (
          <link rel="alternate" hrefLang={language} href={fullUrl(href, ssg.site)} />
        ))}
      {ssg.site && !isErrorPage && alternates.some((alternate) => alternate.locale === "en") && (
        <link
          rel="alternate"
          hrefLang="x-default"
          href={fullUrl(alternates.find((alternate) => alternate.locale === "en")!.href, ssg.site)}
        />
      )}
      <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
      {/* Markdown twin of this page, for agents (RSS-style alternate). */}
      {!isErrorPage && hasMarkdownAlternate && (
        <link rel="alternate" type="text/markdown" href={markdownPath(currentPage)} />
      )}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:locale" content={locale === "fr" ? "fr_FR" : "en_US"} />
      {alternates
        .filter((alternate) => alternate.locale !== locale)
        .map((alternate) => (
          <meta
            property="og:locale:alternate"
            content={alternate.locale === "fr" ? "fr_FR" : "en_US"}
          />
        ))}
      {description && <meta property="og:description" content={description} />}
      {canonical && <meta property="og:url" content={canonical} />}
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
      <meta name="twitter:title" content={title} />
      {description && <meta name="twitter:description" content={description} />}
      {image && <meta name="twitter:image" content={image} />}
    </>
  );
}

export function SEOFooter({ page }: SEOProps) {
  const data = getStructuredData(page);
  return data ? <script type="application/ld+json">{JSON.stringify(data)}</script> : null;
}
