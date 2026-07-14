import type { VNode } from "@vincle/core";

import { raw } from "@vincle/core";
import { Asset } from "@vincle/vite-plugin";

import { useDocs } from "../context.js";
import { Nav } from "./Nav.js";
import { NavToggle } from "./NavToggle.js";
import { PageFooter } from "./PageFooter.js";
import { SearchDialog } from "./SearchDialog.js";
import { TableOfContents } from "./TableOfContents.js";
import { Tabs } from "./Tabs.js";
import { ThemeToggle, themeInitScript } from "./ThemeToggle.js";

const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://img.shields.io https://github.com https://badge.fury.io https://unpkg.com https://img.badgesize.io",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const STRUCTURED_DATA_TEMPLATE = (siteUrl: string, title: string, description: string) =>
  raw(
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: title,
      description: description,
      url: siteUrl,
    })}</script>`,
  );

export function Layout({ children }: { children: VNode }) {
  const { config, meta, currentPage } = useDocs();
  const title = meta.title ? `${meta.title} — ${config.title}` : config.title;
  const description = meta.description ?? config.description;
  const image = meta.image ?? config.image;
  const canonical = config.site ? config.site + currentPage : null;
  const csp = meta.csp ?? DEFAULT_CSP;
  const is404 = currentPage === "/404";
  const isHome = currentPage === "/";

  return (
    <html lang="en" class="docs-html">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#6366f1" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0b0d14" media="(prefers-color-scheme: dark)" />
        {is404 && <meta name="robots" content="noindex" />}
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta http-equiv="Content-Security-Policy" content={csp} />
        <meta
          http-equiv="Permissions-Policy"
          content="camera=(), microphone=(), geolocation=(), interest-cohort=()"
        />
        <link rel="preconnect" href="https://api.fontshare.com" crossorigin />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400,500,600,700&display=swap"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        {canonical && <link rel="canonical" href={canonical} />}
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:locale" content="en_US" />
        {description && <meta property="og:description" content={description} />}
        {canonical && <meta property="og:url" content={canonical} />}
        {image && <meta property="og:image" content={image} />}
        <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
        <meta name="twitter:title" content={title} />
        {description && <meta name="twitter:description" content={description} />}
        {image && <meta name="twitter:image" content={image} />}
        {themeInitScript}
        {config.site && STRUCTURED_DATA_TEMPLATE(config.site, title, description)}
        <Asset entry="docs-src/client.ts" />
      </head>
      <body class="docs-body bg-[var(--docs-color-bg)] text-[var(--docs-color-text)] antialiased">
        <a href="#docs-main" class="docs-skip-link">
          Skip to content
        </a>

        {/* Sticky top header: logo + nav links + search + theme + mobile menu */}
        <header class="sticky top-0 z-40 bg-[var(--docs-color-bg)]/80 [box-shadow:inset_0_-1px_0_var(--docs-color-border)] backdrop-blur-xl">
          <div class="mx-auto flex h-12 max-w-7xl items-center gap-1 px-4 md:px-6">
            <a
              href="/"
              class="shrink-0 text-base font-bold tracking-tight text-[var(--docs-color-text)]"
            >
              {config.title}
            </a>
            {!isHome && <Tabs />}
            <div class="ml-auto flex shrink-0 items-center gap-2">
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

        <div class="docs-shell mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl px-4 md:px-6">
          {!isHome && <Nav />}
          <div
            class={`flex min-w-0 flex-1 flex-col ${isHome ? "mx-auto max-w-5xl" : "px-6 md:px-8 lg:px-12"}`}
          >
            <main id="docs-main" class="docs-main flex-1 scroll-mt-12 py-8" tabindex={-1}>
              {children}
              <PageFooter />
            </main>
          </div>
          {!isHome && (
            <div class="docs-toc-column sticky top-12 hidden h-[calc(100vh-3rem)] w-56 shrink-0 overflow-y-auto py-8 xl:block">
              <TableOfContents />
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
