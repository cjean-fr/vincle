import type { JSX } from "@vincle/core";

import { Asset } from "@vincle/vite-plugin";

import { useDocs, useTranslation } from "../context.js";
import { localeFor, localizedPath, markdownPath, unlocalizedPath } from "../i18n/locale.js";
import { LanguageSwitcher } from "./LanguageSwitcher.js";
import { Nav } from "./Nav.js";
import { NavToggle } from "./NavToggle.js";
import { PageFooter } from "./PageFooter.js";
import { SearchDialog } from "./SearchDialog.js";
import { TableOfContents } from "./TableOfContents.js";
import { Tabs } from "./Tabs.js";
import { ThemeToggle, themeInitScript, themeScriptHash } from "./ThemeToggle.js";

// The hosts the `<head>` below actually loads from: a 'self'-only policy
// would block the site's own font stylesheets, font files and preconnects.
const FONT_STYLES = "https://api.fontshare.com https://fonts.googleapis.com";
// Fontshare's stylesheet points its @font-face files at a separate CDN host.
const FONT_FILES = "https://cdn.fontshare.com https://fonts.gstatic.com";
const FONT_PRECONNECTS = `${FONT_STYLES} ${FONT_FILES}`;

/**
 * The default page CSP.
 *
 * - `script-src` allows the inline theme bootstrap **by hash**, not
 *   `'unsafe-inline'`: the hash is derived from `themeInitScriptSource` at
 *   render time, so it cannot drift from the script it authorizes.
 * - `style-src` keeps `'unsafe-inline'`: expressive-code emits per-token
 *   `style` attributes, which cannot be hashed.
 * - `frame-ancestors` is deliberately absent: it is ignored in a meta CSP, and
 *   only an HTTP header served by the host can enforce it.
 */
async function defaultCsp(): Promise<string> {
  const scriptHash = await themeScriptHash();
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHash}`,
    `style-src 'self' 'unsafe-inline' ${FONT_STYLES}`,
    `font-src 'self' ${FONT_FILES}`,
    "img-src 'self' data: https://img.shields.io https://github.com https://badge.fury.io https://unpkg.com https://img.badgesize.io",
    `connect-src 'self' ${FONT_PRECONNECTS}`,
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

// The JSON goes out as an ordinary child: `<script>` is rawtext, and its
// escaping neutralizes `</script` in a form JSON reads back (`\u003c`). No
// `raw()`, so no guarantee pushed onto the caller.
const StructuredData = ({
  siteUrl,
  title,
  description,
  locale,
}: {
  siteUrl: string;
  title: string;
  description: string;
  locale: string;
}) => (
  <script type="application/ld+json">
    {JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: title,
      description: description,
      url: siteUrl,
      inLanguage: locale,
    })}
  </script>
);

export async function Layout({ children }: { children: JSX.Element }): Promise<JSX.Element> {
  const { config, meta, currentPage, alternates = [] } = useDocs();
  const locale = localeFor(currentPage);
  const t = useTranslation();
  const route = unlocalizedPath(currentPage);
  const title = meta.title ? `${meta.title} — ${config.title}` : config.title;
  const description = meta.description ?? (locale === "en" ? config.description : t("description"));
  const image = meta.image ?? config.image;
  const canonical = config.site ? config.site.replace(/\/+$/, "") + currentPage : null;
  const csp = meta.csp ?? (await defaultCsp());
  const is404 = route === "/404";
  const isErrorPage = is404 || route === "/500";
  const isHome = route === "/";

  return (
    <html lang={locale} class="docs-html">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#fcfdff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#101b2b" media="(prefers-color-scheme: dark)" />
        {isErrorPage && <meta name="robots" content="noindex" />}
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta http-equiv="Content-Security-Policy" content={csp} />
        <meta
          http-equiv="Permissions-Policy"
          content="camera=(), microphone=(), geolocation=(), interest-cohort=()"
        />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400,500,600,700&display=swap"
        />
        {/* One icon only, because `public/` holds just the one. */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        {canonical && !isErrorPage && <link rel="canonical" href={canonical} />}
        {config.site &&
          !isErrorPage &&
          alternates.map(({ locale: language, href }) => (
            <link
              rel="alternate"
              hrefLang={language}
              href={config.site!.replace(/\/+$/, "") + href}
            />
          ))}
        {config.site &&
          !isErrorPage &&
          alternates.some((alternate) => alternate.locale === "en") && (
            <link
              rel="alternate"
              hrefLang="x-default"
              href={
                config.site.replace(/\/+$/, "") +
                alternates.find((alternate) => alternate.locale === "en")!.href
              }
            />
          )}
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        {/* Markdown twin of this page, for agents (RSS-style alternate). */}
        {!isErrorPage && (
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
        {themeInitScript}
        {config.site && (
          <StructuredData
            locale={locale}
            siteUrl={config.site}
            title={title}
            description={description}
          />
        )}
        <Asset entry={config.clientEntry} />
      </head>
      <body class="docs-body bg-[var(--docs-color-bg)] text-[var(--docs-color-text)] antialiased">
        <a href="#docs-main" class="docs-skip-link">
          {t("skipContent")}
        </a>

        {/* Sticky top header: logo + nav links + search + theme + mobile menu */}
        <header class="docs-header sticky top-0 z-40 bg-[var(--docs-color-bg)]/80 [box-shadow:inset_0_-1px_0_var(--docs-color-border)] backdrop-blur-xl">
          <div class="mx-auto flex h-16 max-w-7xl items-center gap-1 px-4 md:px-6">
            <a
              href={localizedPath("/", locale)}
              class="docs-brand shrink-0 text-base font-bold tracking-tight text-[var(--docs-color-text)]"
            >
              <span class="docs-brand-mark" aria-hidden="true">
                v.
              </span>
              {config.title}
            </a>
            <Tabs />
            <div class="ml-auto flex shrink-0 items-center gap-2">
              <LanguageSwitcher />
              <SearchDialog />
              <ThemeToggle />
              {!isHome && <NavToggle />}
            </div>
          </div>
        </header>

        <div
          data-docs-nav-backdrop
          inert
          class="docs-nav-backdrop fixed inset-0 z-30 bg-black/50 opacity-0 backdrop-blur-sm data-open:opacity-100 md:hidden"
        />

        <div class="docs-shell mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl px-4 md:px-6">
          {!isHome && <Nav />}
          <div
            class={`flex min-w-0 flex-1 flex-col ${isHome ? "mx-auto w-full max-w-6xl" : "docs-article px-1 sm:px-6 md:px-8 lg:px-12"}`}
          >
            <main id="docs-main" class="docs-main flex-1 scroll-mt-16 py-10" tabIndex={-1}>
              {children}
              <PageFooter />
            </main>
          </div>
          {!isHome && (
            <div class="docs-toc-column sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 overflow-y-auto py-8 xl:block">
              <TableOfContents />
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
