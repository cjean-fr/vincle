import type { Renderable } from "@vincle/core";
import type { ViteManifest } from "@vincle/vite-plugin";

import { generateSite, renderPage } from "@vincle/ssg";
import { viteModules } from "@vincle/ssg/vite";
import { loadViteManifest, setVite } from "@vincle/vite-plugin";
import { existsSync } from "node:fs";
import { writeFile, mkdir, rm, cp, mkdtemp, readFile } from "node:fs/promises";
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
  generateNetlifyHeaders,
  updateRobotsTxt,
} from "./build-static-assets.js";
import { mapConcurrent } from "./concurrent.js";
import { injectHeadingAnchors } from "./heading-anchors.js";
import { htmlToText } from "./html-text.js";
import { COMPILED_DIR } from "./mdx-cache.js";
import { editUrlFor, lastModified } from "./page-history.js";
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
  const compiler = await viteModules({
    root: path.resolve(import.meta.dirname, "../.."),
    mode: "production",
  });
  try {
    allPages = await discoverPages(config, new Date(), compiler.modules);
  } catch (error) {
    await compiler.dispose();
    throw error;
  }
  // Existing producers prepare the complete site together, including files
  // derived from the rendered HTML. Only the generator publishes it to dist.
  const prepared = await mkdtemp(path.join(tmpdir(), "vincle-docs-"));
  try {
    const rendered = await renderPages(allPages, prepared);
    await postBuild(allPages, rendered, prepared);
    await generateSite({
      out: config.out,
      preserve: ["assets"],
      outputs: [],
      copy: [{ from: prepared }],
    });
  } finally {
    await compiler.dispose();
    await rm(prepared, { recursive: true, force: true });
  }
}

async function cleanupCompiled(): Promise<void> {
  await rm(COMPILED_DIR, { recursive: true, force: true });
}

export async function refreshPages(): Promise<void> {
  await rebuildSite();
  console.log(`[dev] Refreshed ${allPages.length} pages.`);
}

async function renderPages(pages: Page[], out: string): Promise<RenderedPage[]> {
  const typedPages = allPages as (Page & { meta: PageMeta })[];
  const siteLastUpdated = pages.some((page) => page.url === "/")
    ? await lastModified(config.pages)
    : null;

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

      const lastUpdated = page.url === "/" ? siteLastUpdated : null;
      const editUrl = editUrlFor(config.editUrl, page.file);

      const runtime = {
        importSource: page.source.runtime.importSource,
        render: (create: () => unknown) =>
          renderDocument(() => {
            setVite(manifest!, { base: config.assetBase });
            setDocs({
              config,
              currentPage: page.url,
              hasMarkdownAlternate: page.file.endsWith(".mdx"),
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
            const rawInner = create() as Renderable;
            const inner = prose ? <div class="docs-prose">{rawInner}</div> : rawInner;
            return config.layout({ children: inner });
          }),
      };
      for await (const output of renderPage(page, {
        runtime,
        plugins: [
          {
            name: "docs-html",
            transform(renderedOutput) {
              if (
                !renderedOutput.path.endsWith(".html") ||
                typeof renderedOutput.content !== "string"
              )
                return renderedOutput;
              return {
                ...renderedOutput,
                content:
                  "<!DOCTYPE html>\n" +
                  injectHeadingAnchors(
                    injectToc(renderedOutput.content, (entries) => renderTocHtml(entries, locale)),
                    locale,
                  ),
              };
            },
          },
        ],
      })) {
        const target = path.resolve(out, output.path);
        const relative = path.relative(out, target);
        if (
          !relative ||
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        ) {
          throw new Error(`[@vincle/docs] page output escapes its directory: ${page.url}`);
        }
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(
          target,
          output.content instanceof ArrayBuffer ? new Uint8Array(output.content) : output.content,
        );
      }
      const outPath = path.join(out, path.relative(config.out, page.outPath));

      return { url: page.url, title: meta.title ?? page.url, file: outPath };
    },
    concurrency(),
  );
}

interface RenderedPage {
  url: string;
  title: string;
  file: string;
}

async function* readRenderedPages(pages: RenderedPage[], locale: Locale) {
  for (const page of pages) {
    if (localeFor(page.url) !== locale) continue;
    yield { url: page.url, title: page.title, html: await readFile(page.file, "utf-8") };
  }
}

async function* readTextPages(pages: RenderedPage[], locale: Locale) {
  for await (const page of readRenderedPages(pages, locale)) {
    yield { url: page.url, title: page.title, text: htmlToText(page.html) };
  }
}

async function postBuild(pages: Page[], rendered: RenderedPage[], out: string): Promise<void> {
  for (const locale of documentationLocales) {
    const outDir = locale === "en" ? out : path.join(out, locale);
    await mkdir(outDir, { recursive: true });
    await buildMinimatchIndex(
      readRenderedPages(rendered, locale),
      path.join(outDir, "search-index.json"),
    );
  }

  const available = new Set(pages.filter((page) => !page.meta.draft).map((page) => page.url));
  const hasSitemap = config.sitemap && Boolean(config.site);
  await updateRobotsTxt(out, hasSitemap, config.site, config.base);

  if (hasSitemap) {
    await buildSitemap(
      pages.map((p) => ({
        url: p.url,
        draft: p.meta.draft,
        alternates: translationAlternates(p.url, available),
      })),
      config.site!,
      out,
      config.base,
    );
  }

  for (const locale of documentationLocales) {
    const outDir = locale === "en" ? out : path.join(out, locale);
    const localeConfig =
      locale === "en" ? config : { ...config, description: translatorFor(locale)("description") };
    await generateLlmsTxt(
      rendered.filter((page) => localeFor(page.url) === locale),
      localeConfig,
      outDir,
      locale,
    );
    await generateLlmsFullTxt(readTextPages(rendered, locale), localeConfig, outDir, locale);
  }

  await copyStaticAssets(out);
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
    setVite(manifest!, { base: config.assetBase });
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
