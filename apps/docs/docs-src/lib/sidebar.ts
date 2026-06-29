import type {
  PageMeta,
  DirMeta,
  ResolvedSidebar,
  ResolvedSidebarItem,
  TabConfig,
  ResolvedDocsConfig,
} from "../types.js";
import type { Page } from "../types.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export interface NavLink {
  label: string;
  href: string;
}

type DocsPage = Page & { meta: PageMeta };

/** A node in the content tree built from the pages directory structure. */
interface TreeNode {
  /** URL segment / slug of this node (e.g. "getting-started"). */
  name: string;
  /** Absolute path of the directory this node represents, if any. */
  dir: string | null;
  /** Index page sitting directly at this node's directory, if any. */
  page: DocsPage | null;
  children: Map<string, TreeNode>;
}

const NO_META: DirMeta = {};
const metaCache = new Map<string, DirMeta>();

/** Reads a directory's `_meta.json`, caching the result per build. */
async function readDirMeta(dir: string): Promise<DirMeta> {
  const cached = metaCache.get(dir);
  if (cached) return cached;
  const file = path.join(dir, "_meta.json");
  if (!existsSync(file)) {
    metaCache.set(dir, NO_META);
    return NO_META;
  }
  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const meta =
      parsed && typeof parsed === "object" ? (parsed as DirMeta) : NO_META;
    metaCache.set(dir, meta);
    return meta;
  } catch {
    metaCache.set(dir, NO_META);
    return NO_META;
  }
}

/** Clear the `_meta.json` cache (between builds / on rebuild). */
export function clearMetaCache(): void {
  metaCache.clear();
}

/** Clear cache for a single directory (used by the dev server on change). */
export function invalidateMeta(dir: string): void {
  metaCache.delete(dir);
}

/**
 * Build the sidebar for one tab, deriving a hierarchical tree from the
 * directory structure under the tab root, ordered and labelled by each
 * directory's `_meta.json` (falling back to page titles, then slug order).
 */
export async function resolveSidebar(
  config: ResolvedDocsConfig,
  pages: readonly DocsPage[],
  currentUrl: string,
): Promise<ResolvedSidebar> {
  const tab = tabForUrl(config.tabs, currentUrl);
  const pagesDir = path.resolve(config.pages);
  const tabRoot = path.join(pagesDir, tab.slug);

  const tabPages = pages.filter(
    (p) => p.url === "/" + tab.slug || p.url.startsWith("/" + tab.slug + "/"),
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

function tabForUrl(tabs: readonly TabConfig[], url: string): TabConfig {
  const top = url.split("/").filter(Boolean)[0] ?? "";
  return (
    tabs.find((t) => t.slug === top) ??
    tabs.find((t) => t.slug === "guide") ??
    tabs[0]!
  );
}

function insert(root: TreeNode, page: DocsPage): void {
  // url like /guide/getting-started/installation → segments after the tab.
  const withoutTab = page.url.replace(/^\/[^/]+\/?/, "");
  const segments = withoutTab.split("/").filter(Boolean);
  let node = root;
  for (const seg of segments) {
    let child = node.children.get(seg);
    if (!child) {
      child = {
        name: seg,
        dir: node.dir ? path.join(node.dir, seg) : null,
        page: null,
        children: new Map(),
      };
      node.children.set(seg, child);
    }
    node = child;
  }
  node.page = page;
}

async function treeToItems(
  node: TreeNode,
  currentUrl: string,
): Promise<ResolvedSidebarItem[]> {
  if (!node.dir) return [];
  const meta = await readDirMeta(node.dir);
  const entries = [...node.children.values()];

  const items: ResolvedSidebarItem[] = [];
  // First, sort by _meta order (ascending), then by label, then by slug.
  const ordered = sortEntries(entries, meta);

  for (const child of ordered) {
    const entry = meta[child.name] ?? {};
    if (entry.hidden) continue;

    const hasChildren = child.children.size > 0;
    const label = entry.label ?? entry.title;

    if (!hasChildren && child.page) {
      // Leaf page.
      items.push({
        kind: "page",
        label: label ?? child.page.meta.title,
        href: child.page.url,
        current: child.page.url === currentUrl,
      });
    } else if (hasChildren) {
      // Category (directory). It may also carry an index page.
      const childItems = await treeToItems(child, currentUrl);
      const expanded = childItems.some(
        (i) =>
          (i.kind === "page" && i.current) ||
          (i.kind === "category" && i.expanded),
      );
      const categoryLabel =
        label ?? child.page?.meta.title ?? titleCase(child.name);
      items.push({
        kind: "category",
        label: categoryLabel,
        collapsed: entry.collapsed === true && !expanded,
        expanded,
        items: childItems,
      });
      // If the directory also has its own index page, it is reachable via the
      // category heading link (first descendant page). Rendered below only
      // when there is no index page collision — the index becomes the heading.
    } else if (child.page) {
      // Directory's own index page with no further children.
      items.push({
        kind: "page",
        label: label ?? child.page.meta.title,
        href: child.page.url,
        current: child.page.url === currentUrl,
      });
    }
  }
  return items;
}

function sortEntries(entries: TreeNode[], meta: DirMeta): TreeNode[] {
  return [...entries].sort((a, b) => {
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

  const prevPage = idx > 0 ? flat[idx - 1] : null;
  const nextPage = idx < flat.length - 1 ? flat[idx + 1] : null;
  return {
    prev: prevPage ? { label: prevPage.label, href: prevPage.href } : null,
    next: nextPage ? { label: nextPage.label, href: nextPage.href } : null,
  };
}

function flattenPages(
  sidebar: ResolvedSidebar,
): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const group of sidebar.groups) {
    for (const item of group.items) collectPages(item, out);
  }
  return out;
}

function collectPages(
  item: ResolvedSidebarItem,
  out: { label: string; href: string }[],
): void {
  if (item.kind === "page") {
    out.push({ label: item.label, href: item.href });
  } else if (item.kind === "category") {
    for (const child of item.items) collectPages(child, out);
  }
}

/**
 * Resolve the first page URL of a tab (the tab's landing target), in reading
 * order (determined by the sidebar's `_meta.json`). Falls back to the tab root
 * URL when no page exists.
 */
export async function firstPageOfTab(
  config: ResolvedDocsConfig,
  pages: readonly DocsPage[],
  tab: TabConfig,
): Promise<string> {
  const tabUrl = "/" + tab.slug;
  const sidebar = await resolveSidebar(config, pages, tabUrl);
  const flat = flattenPages(sidebar);
  return flat[0]?.href ?? tabUrl;
}
