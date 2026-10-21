import type { PageContext } from "@vincle/ssg";

import { Layout } from "../components/Layout.js";
import { setDocs, type DocsRenderContext } from "../lib/context.js";
import { t } from "../lib/messages.js";

export const meta = { title: t("notFoundTitle"), layout: false, sitemap: false, search: false };

/** The site shell, without sidebar, footer or alternates: no source to point at. */
export default async function NotFound(context: PageContext) {
  const resolveContext = context.meta["documentation"] as () => Promise<DocsRenderContext>;
  const { config, currentPage, resolvedTabs } = await resolveContext();
  setDocs({
    config,
    currentPage,
    meta: { title: t("notFoundTitle") },
    sidebar: { groups: [] },
    currentTab: null,
    resolvedTabs,
    lastUpdated: null,
    editUrl: null,
    prev: null,
    next: null,
  });
  return Layout({
    children: (
      <main class="docs-main mx-auto max-w-2xl py-16 text-center">
        <h1 class="text-6xl font-bold text-gray-300 dark:text-gray-700">404</h1>
        <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">{t("notFoundMessage")}</p>
        <a
          href="/"
          class="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
        >
          {t("backHome")}
        </a>
      </main>
    ),
  });
}
