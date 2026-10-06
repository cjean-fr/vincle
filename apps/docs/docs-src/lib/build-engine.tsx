import type { ViteManifest } from "@vincle/vite-plugin";

import { generateSite, type SiteOutput } from "@vincle/site";
import { loadViteManifest, setVite } from "@vincle/vite-plugin";
import { existsSync } from "node:fs";
import { writeFile, mkdir, rm, cp, readdir, mkdtemp, readFile } from "node:fs/promises";
import { availableParallelism, cpus, tmpdir } from "node:os";
import path from "node:path";

import type { Page, PageMeta } from "../types.js";

import config from "../../docs.config.js";
import { setDocs } from "../context.js";
import { translatorFor } from "../i18n/interface.js";
import { localeFor, localizedPath, translationAlternates, type Locale } from "../i18n/locale.js";
import { buildMinimatchIndex } from "../search/minimatch-build.js";
import { buildSitemap } from "./build-sitemap.js";
import {
  generateAgentSkillsIndex,
  generateAiCatalog,
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateMarkdownAlternates,
  generateNetlifyHeaders,
  updateRobotsTxt,
} from "./build-static-assets.js";
import { injectHeadingAnchors } from "./heading-anchors.js";
import { htmlToText } from "./html-text.js";
import { COMPILED_DIR } from "./mdx-cache.js";
import { clearHistoryCache, editUrlFor, lastModified } from "./page-history.js";
import { discoverPages } from "./pages.js";
import { renderDocument } from "./render-document.js";
import {
  resolveSidebar,
  resolveNavigation,
  clearMetaCache,
  firstPageOfTab,
  tabFor,
} from "./sidebar.js";
import { injectToc, renderTocHtml } from "./toc.js";

function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  maxConcurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  };
  const pool = Math.min(maxConcurrency, items.length) || 1;
  // Wait for every writer before disposing the prepared directory on failure.
  return Promise.allSettled(Array.from({ length: pool }, worker)).then((settled) => {
    const failed = settled.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    return results;
  });
}

function concurrency(): number {
  return Math.min(
    Number(process.env["BUILD_CONCURRENCY"]) || availableParallelism?.() || cpus().length || 4,
    16,
  );
}

const documentationLocales = ["en"] as readonly Locale[];

let manifest: ViteManifest | null = null;
let allPages: Page[] = [];
let tabsByLocale: Record<Locale, { label: string; slug: string; href: string }[]> = {
  en: [],
  fr: [],
};

export async function initBuild(): Promise<void> {
  manifest = await loadViteManifest(path.resolve(config.viteManifest));
  if (!manifest) {
    throw new Error(`[@vincle/docs] Vite manifest not found. Run \`vite build\` first.`);
  }
}

export async function rebuildAll(): Promise<void> {
  if (!manifest) await initBuild();
  await cleanupCompiled();
  await rebuildSite();
  console.log(`Built ${allPages.length} pages.`);
}

/** Full builds and development refreshes own the same generated output. */
async function rebuildSite(): Promise<void> {
  if (!manifest) await initBuild();
  clearMetaCache();
  clearHistoryCache();
  allPages = await discoverPages(config);
  // Existing producers prepare the complete site together, including files
  // derived from the rendered HTML. Only the generator publishes it to dist.
  const prepared = await mkdtemp(path.join(tmpdir(), "vincle-docs-"));
  try {
    const rendered = await renderPages(allPages, prepared);
    await postBuild(allPages, rendered, prepared);
    await generateSite({
      out: config.out,
      preserve: ["assets"],
      outputs: preparedOutputs(prepared),
    });
  } finally {
    await rm(prepared, { recursive: true, force: true });
  }
}

async function cleanupCompiled(): Promise<void> {
  await rm(COMPILED_DIR, { recursive: true, force: true });
}

/** Walk the prepared site; binary files retain their original bytes. */
async function* preparedOutputs(dir: string, prefix = ""): AsyncGenerator<SiteOutput> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`[@vincle/docs] symbolic output: ${relative}`);
    if (entry.isDirectory()) yield* preparedOutputs(file, relative);
    else yield { path: relative, content: () => readFile(file) };
  }
}

export async function refreshPages(): Promise<void> {
  await rebuildSite();
  console.log(`[dev] Refreshed ${allPages.length} pages.`);
}

async function renderPages(
  pages: Page[],
  out: string,
): Promise<{ url: string; title: string; html: string }[]> {
  const typedPages = allPages as (Page & { meta: PageMeta })[];

  const available = new Set(typedPages.filter((page) => !page.meta.draft).map((page) => page.url));
  if (available.size !== typedPages.filter((page) => !page.meta.draft).length) {
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
          : await firstPageOfTab(config, typedPages, tab, locale),
      })),
    );
  }

  return mapConcurrent(
    pages,
    async (page) => {
      const meta = page.meta;
      const locale = localeFor(page.url);
      const sidebar = await resolveSidebar(config, typedPages, page.url);
      const { prev, next } = resolveNavigation(sidebar, page.url);
      const currentTab = tabFor(config.tabs, page.url);
      const ext = path.extname(page.file);
      const prose = meta.prose === false ? false : (config.handlers[ext]?.prose ?? false);

      // Resolved before the render: `setDocs` runs inside the scope and must be
      // synchronous, so an await in there would set the context too late.
      const lastUpdated = await lastModified(page.file);
      const editUrl = editUrlFor(config.editUrl, page.file);

      const html = await renderDocument(
        () => {
          setVite(manifest!, { base: config.base });
          setDocs({
            config,
            currentPage: page.url,
            meta,
            sidebar,
            currentTab,
            resolvedTabs: tabsByLocale[locale],
            alternates: translationAlternates(page.url, available),
            lastUpdated,
            editUrl,
            prev,
            next,
          });
          const rawInner = page.Component({});
          const inner = prose ? <div class="docs-prose">{rawInner}</div> : rawInner;
          return config.layout({ children: inner });
        },
        {
          transforms: [
            (h) => injectToc(h, (entries) => renderTocHtml(entries, locale)),
            (h) => injectHeadingAnchors(h, locale),
          ],
        },
      );

      const fullHtml = "<!DOCTYPE html>\n" + html;
      const relative = path.relative(config.out, page.outPath);
      if (
        !relative ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      )
        throw new Error(`[@vincle/docs] page output escapes its directory: ${page.url}`);
      const outPath = path.join(out, relative);
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, fullHtml, "utf-8");

      return { url: page.url, title: meta.title ?? page.url, html };
    },
    concurrency(),
  );
}

async function postBuild(
  pages: Page[],
  rendered: { url: string; title: string; html: string }[],
  out: string,
): Promise<void> {
  const pageData = rendered.map((r) => ({
    url: r.url,
    title: r.title,
    html: r.html,
  }));

  for (const locale of documentationLocales) {
    const outDir = locale === "en" ? out : path.join(out, locale);
    await mkdir(outDir, { recursive: true });
    await buildMinimatchIndex(
      pageData.filter((page) => localeFor(page.url) === locale),
      path.join(outDir, "search-index.json"),
    );
  }

  const hasSitemap = config.sitemap && Boolean(config.site);
  await updateRobotsTxt(out, hasSitemap, config.site);

  if (hasSitemap) {
    await buildSitemap(
      pages.map((p) => ({
        url: p.url,
        draft: p.meta.draft,
        alternates: translationAlternates(
          p.url,
          new Set(pages.filter((page) => !page.meta.draft).map((page) => page.url)),
        ),
      })),
      config.site!,
      out,
    );
  }

  const textPages = rendered.map((r) => ({
    url: r.url,
    title: r.title,
    html: r.html,
    text: htmlToText(r.html),
  }));
  for (const locale of documentationLocales) {
    const outDir = locale === "en" ? out : path.join(out, locale);
    const localeConfig =
      locale === "en" ? config : { ...config, description: translatorFor(locale)("description") };
    await generateLlmsTxt(
      pageData.filter((page) => localeFor(page.url) === locale),
      localeConfig,
      outDir,
      locale,
    );
    await generateLlmsFullTxt(
      textPages.filter((page) => localeFor(page.url) === locale),
      localeConfig,
      outDir,
      locale,
    );
  }

  await copyStaticAssets(out);
  await generateMarkdownAlternates(pages, out);
  await generateNetlifyHeaders(out);
  await generateAgentSkillsIndex(out);
  await generateAiCatalog(out, config);

  for (const locale of documentationLocales) {
    const t = translatorFor(locale);
    await renderError(404, t("notFoundTitle"), t("notFoundMessage"), locale, out);
    await renderError(500, t("errorTitle"), t("errorMessage"), locale, out);
  }
}

async function renderError(
  status: number,
  title: string,
  message: string,
  locale: Locale,
  out: string,
): Promise<void> {
  const html = await renderDocument(() => {
    setVite(manifest!, { base: config.base });
    setDocs({
      config,
      currentPage: localizedPath(`/${status}`, locale),
      meta: { title },
      sidebar: { groups: [] },
      currentTab: null,
      resolvedTabs: tabsByLocale[locale],
      lastUpdated: null,
      editUrl: null,
      prev: null,
      next: null,
    });
    return config.layout({
      children: (
        <main class="docs-main mx-auto max-w-2xl py-16 text-center">
          <h1 class="text-6xl font-bold text-gray-300 dark:text-gray-700">{status}</h1>
          <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">{message}</p>
          <a
            href={localizedPath("/", locale)}
            class="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            {translatorFor(locale)("backHome")}
          </a>
        </main>
      ),
    });
  });
  await writeFile(
    path.join(out, locale === "en" ? `${status}.html` : `${locale}/${status}.html`),
    "<!DOCTYPE html>\n" + html,
    "utf-8",
  );
}

async function copyStaticAssets(out: string): Promise<void> {
  const outDir = path.resolve(out);
  // `public/` is Vite's: it also lands in `dist/assets/`, so it stays limited
  // to browser assets. The agent-facing files (.well-known/) come
  // from `agent/` and only exist at the site root.
  const publicDir = path.resolve(config.pages, "../../public");
  if (existsSync(publicDir)) await cp(publicDir, outDir, { recursive: true });
  const agentDir = path.resolve(config.pages, "../../agent");
  if (existsSync(agentDir)) await cp(agentDir, outDir, { recursive: true });
}

export function getAllPages(): Page[] {
  return allPages;
}
