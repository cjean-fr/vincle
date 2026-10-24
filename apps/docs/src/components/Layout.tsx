import { raw, type JSX, type Renderable } from "@vincle/core";
import { Asset } from "@vincle/vite-plugin";

import { useDocs } from "../lib/context.js";
import { CspService, Script, withHash } from "../lib/csp.js";
import { t } from "../lib/messages.js";
import { GitHubLink } from "./GitHubLink.js";
import { Nav } from "./Nav.js";
import { NavToggle } from "./NavToggle.js";
import { PageFooter } from "./PageFooter.js";
import { SearchDialog, searchShortcutInitScriptSource } from "./SearchDialog.js";
import { SEOHeader, SEOFooter } from "./SEO.js";
import { TableOfContents } from "./TableOfContents.js";
import { Tabs } from "./Tabs.js";
import { ThemeToggle, themeInitScriptSource } from "./ThemeToggle.js";

/** Restore package manager before content paints; CSS selects the initial panel. */
const tabsInitScriptSource = `try{var p=localStorage.getItem("docs-tabs-sync:pkg-manager");if(p==="npm"||p==="pnpm"||p==="bun")document.documentElement.setAttribute("data-docs-package-manager",p)}catch{}`;

export async function Layout({ children }: { children: Renderable }): Promise<JSX.Element> {
  const page = useDocs();
  const { config, meta, currentPage } = page;
  const collector = new CspService();
  const HashedScript = withHash(Script, collector);
  const themeScript = await HashedScript({ children: themeInitScriptSource });
  const tabsScript = await HashedScript({ children: tabsInitScriptSource });
  const searchShortcutScript = await HashedScript({ children: searchShortcutInitScriptSource });
  const csp = meta.csp ?? collector.getCSPHeader();
  const isHome = currentPage === "/";

  return (
    <>
      {raw("<!DOCTYPE html>\n")}
      <html lang="en">
        <head>
          <meta charSet="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta name="color-scheme" content="light dark" />
          <meta name="theme-color" content="#fcfdff" media="(prefers-color-scheme: light)" />
          <meta name="theme-color" content="#101b2b" media="(prefers-color-scheme: dark)" />
          <meta name="referrer" content="strict-origin-when-cross-origin" />
          <meta http-equiv="Content-Security-Policy" content={csp} />
          <meta
            http-equiv="Permissions-Policy"
            content="camera=(), microphone=(), geolocation=(), interest-cohort=()"
          />
          <SEOHeader page={page} />
          {themeScript}
          {tabsScript}
          {searchShortcutScript}
          <Asset entry="src/_client/main.ts" />
          <Asset entry="src/_client/main.css" />
        </head>
        <body class="docs-body bg-[var(--docs-color-bg)] text-[var(--docs-color-text)] antialiased">
          <a href="#docs-main" class="docs-skip-link">
            {t("skipContent")}
          </a>

          {/* Fixed top header: logo + nav links + search + theme + mobile menu */}
          <header class="docs-header fixed inset-x-0 top-0 z-40 bg-[var(--docs-color-bg)]/80 [box-shadow:inset_0_-1px_0_var(--docs-color-border)] backdrop-blur-xl">
            <div class="mx-auto flex h-16 max-w-7xl items-center gap-1 px-4 md:px-6">
              <a
                href="/"
                class="docs-brand shrink-0 text-base font-bold tracking-tight text-[var(--docs-color-text)]"
              >
                <span class="docs-brand-mark" aria-hidden="true">
                  v.
                </span>
                {config.title}
              </a>
              <Tabs />
              <div class="ml-auto flex shrink-0 items-center gap-2">
                <SearchDialog />
                <GitHubLink />
                <ThemeToggle />
                <NavToggle />
              </div>
            </div>
          </header>

          <div
            data-docs-nav-backdrop
            inert
            class="docs-nav-backdrop fixed inset-0 z-30 bg-black/50 opacity-0 backdrop-blur-sm data-open:opacity-100 md:hidden"
          />

          <div class="docs-shell mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl px-4 md:px-6">
            <Nav drawerOnly={isHome} />
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
          <SEOFooter page={page} />
        </body>
      </html>
    </>
  );
}
