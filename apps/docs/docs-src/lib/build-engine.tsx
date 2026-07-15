import type { ViteManifest } from "@vincle/vite-plugin";

import { loadViteManifest, setVite } from "@vincle/vite-plugin";
import { existsSync } from "node:fs";
import { writeFile, mkdir, rm, readdir, copyFile } from "node:fs/promises";
import { availableParallelism, cpus } from "node:os";
import path from "node:path";

import type { Page, PageMeta, TabConfig } from "../types.js";

import config from "../../docs.config.js";
import { setDocs } from "../context.js";
import { buildMinimatchIndex } from "../search/minimatch-build.js";
import { buildSitemap } from "./build-sitemap.js";
import {
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateManifest,
  generateSecurityTxt,
  updateRobotsTxt,
  extractPlainText,
} from "./build-static-assets.js";
import { injectHeadingAnchors } from "./heading-anchors.js";
import { discoverPages } from "./pages.js";
import { renderDocument } from "./render-document.js";
import { resolveSidebar, resolveNavigation, clearMetaCache, firstPageOfTab } from "./sidebar.js";
import { injectToc, renderTocHtml } from "./toc.js";

function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  maxConcurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  };
  const pool = Math.min(maxConcurrency, items.length) || 1;
  return Promise.all(Array.from({ length: pool }, worker)).then(() => results);
}

function concurrency(): number {
  return Math.min(
    Number(process.env["BUILD_CONCURRENCY"]) || availableParallelism?.() || cpus().length || 4,
    16,
  );
}

let manifest: ViteManifest | null = null;
let allPages: Page[] = [];
let resolvedTabs: { label: string; slug: string; href: string }[] = [];

export async function initBuild(): Promise<void> {
  manifest = await loadViteManifest(path.resolve(config.viteManifest));
  if (!manifest) {
    throw new Error(`[@vincle/docs] Vite manifest not found. Run \`vite build\` first.`);
  }
}

export async function rebuildAll(): Promise<void> {
  if (!manifest) await initBuild();
  await cleanupCompiled();
  clearMetaCache();
  allPages = await discoverPages(config);
  const rendered = await renderPages(allPages);
  await postBuild(allPages, rendered);
  console.log(`Built ${allPages.length} pages.`);
}

async function cleanupCompiled(): Promise<void> {
  const compiledDir = path.resolve(config.pages, ".compiled");
  if (existsSync(compiledDir)) {
    await rm(compiledDir, { recursive: true, force: true });
  }
}

export async function rebuildPages(urls: string[]): Promise<void> {
  if (!manifest) await initBuild();

  const knownUrls = new Map(allPages.map((p) => [p.url, p]));
  const newPages: Page[] = [];

  for (const url of urls) {
    if (knownUrls.has(url)) {
      newPages.push(knownUrls.get(url)!);
    }
  }

  if (newPages.length > 0) {
    await renderPages(newPages);
    console.log(`[dev] Rebuilt ${newPages.length} page(s).`);
  }
}

export async function refreshPages(): Promise<void> {
  clearMetaCache();
  allPages = await discoverPages(config);
  const rendered = await renderPages(allPages);
  await postBuild(allPages, rendered);
  console.log(`[dev] Refreshed ${allPages.length} pages.`);
}

async function renderPages(pages: Page[]): Promise<{ url: string; title: string; html: string }[]> {
  const typedPages = allPages as (Page & { meta: PageMeta })[];

  // Resolve tab hrefs once for the entire build.
  resolvedTabs = await Promise.all(
    config.tabs.map(async (tab) => ({
      label: tab.label,
      slug: tab.slug,
      href: tab.href ?? (await firstPageOfTab(config, typedPages, tab)),
    })),
  );

  return mapConcurrent(
    pages,
    async (page) => {
      const meta = page.meta;
      const sidebar = await resolveSidebar(config, typedPages, page.url);
      const { prev, next } = resolveNavigation(sidebar, page.url);
      const currentTab = tabForPage(config.tabs, page.url);
      const ext = path.extname(page.file);
      const prose = config.handlers[ext]?.prose ?? false;

      const html = await renderDocument(
        () => {
          setVite(manifest!, { base: config.base });
          setDocs({
            config,
            currentPage: page.url,
            meta,
            sidebar,
            currentTab,
            resolvedTabs,
            lastUpdated: null,
            editUrl: null,
            prev,
            next,
          });
          const rawInner = page.Component({});
          const inner = prose ? <div class="docs-prose">{rawInner}</div> : rawInner;
          return config.layout({ children: inner });
        },
        {
          transforms: [(h) => injectToc(h, renderTocHtml), injectHeadingAnchors],
        },
      );

      const fullHtml = "<!DOCTYPE html>\n" + html;
      await mkdir(path.dirname(page.outPath), { recursive: true });
      await writeFile(page.outPath, fullHtml, "utf-8");

      return { url: page.url, title: meta.title ?? page.url, html };
    },
    concurrency(),
  );
}

function tabForPage(tabs: readonly TabConfig[], url: string): TabConfig | null {
  const top = url.split("/").find(Boolean) ?? "";
  return tabs.find((t) => t.slug === top) ?? null;
}

async function postBuild(
  pages: Page[],
  rendered: { url: string; title: string; html: string }[],
): Promise<void> {
  const pageData = rendered.map((r) => ({
    url: r.url,
    title: r.title,
    html: r.html,
  }));

  await buildMinimatchIndex(pageData, path.join(config.out, "search-index.json"));

  const hasSitemap = config.sitemap && Boolean(config.site);
  await updateRobotsTxt(config.out, hasSitemap, config.site);

  if (hasSitemap) {
    await buildSitemap(
      pages.map((p) => ({ url: p.url, draft: p.meta.draft })),
      config.site!,
      config.out,
    );
  }

  const textPages = rendered.map((r) => ({
    url: r.url,
    title: r.title,
    html: r.html,
    text: extractPlainText(r.html),
  }));
  await generateLlmsTxt(pageData, config, config.out);
  await generateLlmsFullTxt(textPages, config, config.out);
  await generateManifest(config, config.out);
  await generateSecurityTxt(config, config.out);

  await renderError(404, "Page Not Found", "Page not found.");
  await renderError(500, "Server Error", "Server error. Something went wrong.");
  await copyPublicAssets();
}

async function renderError(status: number, title: string, message: string): Promise<void> {
  const html = await renderDocument(() => {
    setVite(manifest!, { base: config.base });
    setDocs({
      config,
      currentPage: `/${status}`,
      meta: { title },
      sidebar: { groups: [] },
      currentTab: null,
      resolvedTabs,
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
            href="/"
            class="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            ← Back to home
          </a>
        </main>
      ),
    });
  });
  await writeFile(path.join(config.out, `${status}.html`), "<!DOCTYPE html>\n" + html, "utf-8");
}

async function copyPublicAssets(): Promise<void> {
  const publicDir = path.resolve(config.pages, "../../public");
  if (!existsSync(publicDir)) return;
  const entries = await readdir(publicDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((e) => e.isFile())
      .map((e) => copyFile(path.join(publicDir, e.name), path.join(config.out, e.name))),
  );
}

export function getAllPages(): Page[] {
  return allPages;
}
