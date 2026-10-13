import type { PageHandler, DiscoveredPage, SsgMeta } from "@vincle/ssg";
export type { PageHandler } from "@vincle/ssg";

export interface PageMeta extends SsgMeta {
  title: string;
  description?: string;
  image?: string;
  slug?: string;
  draft?: boolean;
  /** Include the page only on builds at or after this date (date-only: UTC). */
  published_at?: string;
  csp?: string;
  /** Opt out of the handler's prose wrapper (default for `.mdx`: on). */
  prose?: boolean;
}

// No `sidebar` here: label, order, grouping and hiding are decided by each
// directory's `_meta.json` (see `lib/sidebar.ts`). A page-level copy was
// declared and never read, and the two had already drifted: two pages claiming
// `order: 2`, and a third order the sidebar did not use.

export interface ResolvedSidebar {
  groups: ReadonlyArray<{
    label: string | null;
    items: ReadonlyArray<ResolvedSidebarItem>;
  }>;
}

export type ResolvedSidebarItem = ResolvedSidebarPage | ResolvedSidebarCategory;

export interface ResolvedSidebarPage {
  kind: "page";
  label: string;
  href: string;
  current: boolean;
}

export interface ResolvedSidebarCategory {
  kind: "category";
  label: string;
  /** Collapsed-by-default state for this category. */
  collapsed: boolean;
  /** True if this category (or any descendant) contains the current page. */
  expanded: boolean;
  items: ReadonlyArray<ResolvedSidebarItem>;
}

/**
 * A top-level navigation tab, mapping a content root folder (e.g. `guide/`) to
 * a labelled tab in the header. `href` is optional, when omitted, it resolves
 * to the first page of the tab in reading order.
 */
export interface TabConfig {
  label: string;
  slug: string;
  /** Optional explicit link target (first page of the tab by default). */
  href?: string;
}

/**
 * One entry in a directory's `_meta.json`: controls how a child page or
 * sub-directory is rendered in the sidebar.
 */
export interface MetaEntry {
  title?: string;
  /** Display label (defaults to title). */
  label?: string;
  /** Sort position within its parent (ascending; unset sorts after). */
  order?: number;
  /** Hide from the sidebar (still routable). */
  hidden?: boolean;
  /** Collapse this category's children by default. */
  collapsed?: boolean;
}

/** Per-directory metadata loaded from `_meta.json` files. */
export type DirMeta = Readonly<Record<string, MetaEntry>>;

export interface DocsConfig {
  title: string;
  tagline?: string;
  description?: string;
  pages?: string;
  clientEntry?: string;
  /** Deployment path for documentation pages. */
  base?: string;
  /** Explicit top-level navigation tabs. */
  tabs: readonly TabConfig[];
  editUrl?: string | null;
  site?: string | null;
  image?: string;
  sitemap?: boolean;
  handlers?: Record<string, PageHandler>;
  /** Override the default page shell (Layout). Receives children already wrapped by the handler's prose wrapper. */
  layout?: (props: {
    children: import("@vincle/core").Renderable;
  }) => import("@vincle/core").Awaitable<import("@vincle/core").Renderable>;
}

export interface ResolvedDocsConfig {
  title: string;
  tagline: string | null;
  description: string;
  pages: string;
  clientEntry: string;
  base: string;
  tabs: readonly TabConfig[];
  editUrl: string | null;
  site: string | null;
  image: string | null;
  sitemap: boolean;
  handlers: Record<string, PageHandler>;
  layout: (props: {
    children: import("@vincle/core").Renderable;
  }) => import("@vincle/core").Awaitable<import("@vincle/core").Renderable>;
}

export interface Page extends DiscoveredPage {
  url: string;
  file: string;
  handler: string;
  meta: PageMeta;
}
