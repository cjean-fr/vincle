import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  DirMeta,
  ResolvedSidebar,
  ResolvedSidebarItem,
  TabConfig,
  ResolvedDocsConfig,
} from "./types.js";
import type { Page } from "./types.js";

import { localeFor, localizedPath, unlocalizedPath } from "./i18n/locale.js";

export interface NavLink {
  label: string;
  href: string;
}

/** A node in the content tree built from the pages directory structure. */
interface TreeNode {
  /** URL segment / slug of this node (e.g. "getting-started"). */
  name: string;
  /** Absolute path of the directory this node represents, if any. */
  dir: string;
  /** Index page sitting directly at this node's directory, if any. */
  page: Page | null;
  children: Map<string, TreeNode>;
}

const NO_META: DirMeta = {};

/** Promises, not values: caching the value would leave a window during the `await readFile`. */
const metaCache = new Map<string, Promise<DirMeta>>();

/** Reads a directory's `_meta.json`, caching the result per build. */
export function readDirMeta(dir: string): Promise<DirMeta> {
  const cached = metaCache.get(dir);
  if (cached) return cached;

  const load = async (): Promise<DirMeta> => {
    const file = path.join(dir, "_meta.json");
    try {
      const parsed = JSON.parse(await readFile(file, "utf-8")) as Record<string, unknown>;
      return parsed && typeof parsed === "object" ? (parsed as DirMeta) : NO_META;
    } catch {
      return NO_META;
    }
  };

  const promise = load();
  metaCache.set(dir, promise);
  return promise;
}

/** Clear the `_meta.json` cache (between builds / on rebuild). */
export function clearMetaCache(): void {
  metaCache.clear();
}

/**
 * Build the sidebar for one tab, deriving a hierarchical tree from the
 * directory structure under the tab root, ordered and labelled by each
 * directory's `_meta.json` (falling back to page titles, then slug order).
 */
export async function resolveSidebar(
  config: ResolvedDocsConfig,
  pages: readonly Page[],
  currentUrl: string,
): Promise<ResolvedSidebar> {
  const tab = tabFor(config.tabs, currentUrl);
  // A page outside any tab (`/privacy`) has no navigation: falling back to the
  // guide's sidebar would show it with no active tab to explain why.
  if (!tab) return { groups: [] };
  const locale = localeFor(currentUrl);
  const pagesDir = path.resolve(config.pages, locale === "fr" ? "fr" : ".");
  const tabRoot = path.join(pagesDir, tab.slug);

  const tabPages = pages.filter(
    (p) =>
      localeFor(p.url) === locale &&
      (unlocalizedPath(p.url) === "/" + tab.slug ||
        unlocalizedPath(p.url).startsWith("/" + tab.slug + "/")),
  );

  const root: TreeNode = {
    name: tab.slug,
    dir: tabRoot,
    page: null,
    children: new Map(),
  };
  for (const page of tabPages) {
    insert(root, page);
  }

  const items = await treeToItems(root, currentUrl);
  return { groups: [{ label: null, items }] };
}

/** The tab a URL belongs to: the one rule, for every caller. */
export function tabFor(tabs: readonly TabConfig[], url: string): TabConfig | null {
  const top = unlocalizedPath(url).split("/").find(Boolean) ?? "";
  return tabs.find((t) => t.slug === top) ?? null;
}

function insert(root: TreeNode, page: Page): void {
  // url like /guide/getting-started/installation → segments after the tab.
  const withoutTab = unlocalizedPath(page.url).replace(/^\/[^/]+\/?/, "");
  const segments = withoutTab.split("/").filter(Boolean);
  let node = root;
  for (const seg of segments) {
    let child = node.children.get(seg);
    if (!child) {
      child = {
        name: seg,
        dir: path.join(node.dir, seg),
        page: null,
        children: new Map(),
      };
      node.children.set(seg, child);
    }
    node = child;
  }
  node.page = page;
}

async function treeToItems(node: TreeNode, currentUrl: string): Promise<ResolvedSidebarItem[]> {
  const meta = await readDirMeta(node.dir);
  const entries = [...node.children.values()];

  // First, sort by _meta order (ascending), then by label, then by slug.
  const ordered = sortEntries(entries, meta);

  const results = await Promise.all(
    ordered.map(async (child): Promise<ResolvedSidebarItem | null> => {
      const entry = meta[child.name] ?? {};
      if (entry.hidden) return null;

      const hasChildren = child.children.size > 0;
      const label = entry.label ?? entry.title;

      if (!hasChildren && child.page) {
        // Leaf page.
        return {
          kind: "page",
          label: label ?? child.page.meta.title,
          href: child.page.url,
          current: child.page.url === currentUrl,
        };
      }

      if (hasChildren) {
        // Category (directory). It may also carry an index page.
        const childItems = await treeToItems(child, currentUrl);
        const expanded = childItems.some(
          (i) => (i.kind === "page" && i.current) || (i.kind === "category" && i.expanded),
        );
        return {
          kind: "category",
          label: label ?? child.page?.meta.title ?? titleCase(child.name),
          collapsed: entry.collapsed === true && !expanded,
          expanded,
          items: childItems,
        };
      }

      return null;
    }),
  );

  return results.filter((r): r is ResolvedSidebarItem => r !== null);
}

function sortEntries(entries: TreeNode[], meta: DirMeta): TreeNode[] {
  return entries.toSorted((a, b) => {
    const ma = meta[a.name] ?? {};
    const mb = meta[b.name] ?? {};
    const oa = ma.order ?? Number.POSITIVE_INFINITY;
    const ob = mb.order ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    const la = ma.label ?? ma.title ?? titleCase(a.name);
    const lb = mb.label ?? mb.title ?? titleCase(b.name);
    return la.localeCompare(lb) || a.name.localeCompare(b.name);
  });
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Flatten the sidebar tree into the reading order of pages for prev/next
 * navigation. Categories contribute their index page (if any) and then their
 * descendants in order.
 */
export function resolveNavigation(
  sidebar: ResolvedSidebar,
  currentUrl: string,
): { prev: NavLink | null; next: NavLink | null } {
  const flat = flattenPages(sidebar);
  const idx = flat.findIndex((p) => p.href === currentUrl);
  if (idx === -1) return { prev: null, next: null };

  return { prev: flat[idx - 1] ?? null, next: flat[idx + 1] ?? null };
}

function flattenPages(sidebar: ResolvedSidebar): NavLink[] {
  const collect = (items: readonly ResolvedSidebarItem[]): NavLink[] =>
    items.flatMap((item) =>
      item.kind === "page" ? [{ label: item.label, href: item.href }] : collect(item.items),
    );
  return sidebar.groups.flatMap((group) => collect(group.items));
}

/**
 * Resolve the first page URL of a tab (the tab's landing target), in reading
 * order (determined by the sidebar's `_meta.json`). Falls back to the tab root
 * URL when no page exists.
 */
export async function firstPageOfTab(
  config: ResolvedDocsConfig,
  pages: readonly Page[],
  tab: TabConfig,
  locale: import("./i18n/locale.js").Locale = "en",
): Promise<string> {
  const tabUrl = localizedPath("/" + tab.slug, locale);
  const sidebar = await resolveSidebar(config, pages, tabUrl);
  const flat = flattenPages(sidebar);
  return flat[0]?.href ?? tabUrl;
}
