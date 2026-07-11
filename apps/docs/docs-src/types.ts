export interface PageMeta {
  title: string;
  description?: string;
  image?: string;
  slug?: string;
  draft?: boolean;
  csp?: string;
  sidebar?: {
    label?: string;
    order?: number;
    group?: string;
    hidden?: boolean;
  };
}

export type SidebarConfig = "auto" | readonly string[];

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

export type SidebarItem = string | SidebarLink;

export interface SidebarLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface ResolvedSidebar {
  groups: ReadonlyArray<{
    label: string | null;
    items: ReadonlyArray<ResolvedSidebarItem>;
  }>;
}

export type ResolvedSidebarItem =
  ResolvedSidebarPage | ResolvedSidebarLink | ResolvedSidebarCategory;

export interface ResolvedSidebarPage {
  kind: "page";
  label: string;
  href: string;
  current: boolean;
}

export interface ResolvedSidebarLink {
  kind: "link";
  label: string;
  href: string;
  external: boolean;
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
 * a labelled tab in the header. `href` is optional — when omitted, it resolves
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
  /** Render as a separator (heading only, no children) — reserved. */
  separated?: boolean;
}

/** Per-directory metadata loaded from `_meta.json` files. */
export type DirMeta = Readonly<Record<string, MetaEntry>>;

export interface PageHandler {
  name: string;
  load(
    file: string,
    pagesDir: string,
    config: ResolvedDocsConfig,
  ): Promise<Page>;
}

export interface HandlerEntry {
  handler: PageHandler;
  prose?: boolean;
}

export interface DocsConfig {
  title: string;
  tagline?: string;
  description?: string;
  pages?: string;
  examples?: string;
  clientEntry?: string;
  out?: string;
  base?: string;
  viteManifest?: string;
  sidebar?: SidebarConfig;
  /** Top-level navigation tabs. Auto-detected from content roots when omitted. */
  tabs?: readonly TabConfig[];
  /** Reserved for future i18n. `null` = no locale prefix in URLs. */
  locale?: string | null;
  editUrl?: string | null;
  site?: string | null;
  image?: string;
  sitemap?: boolean;
  handlers?: Record<string, HandlerEntry>;
  /** Override the default page shell (Layout). Receives children already wrapped by the handler's prose wrapper. */
  layout?: (props: {
    children: import("@vincle/core").VNode;
  }) => import("@vincle/core").VNode;
}

export interface ResolvedDocsConfig {
  title: string;
  tagline: string | null;
  description: string;
  pages: string;
  examples: string;
  clientEntry: string;
  out: string;
  base: string;
  viteManifest: string;
  sidebar: SidebarConfig;
  tabs: readonly TabConfig[];
  locale: string | null;
  editUrl: string | null;
  site: string | null;
  image: string | null;
  sitemap: boolean;
  handlers: Record<string, HandlerEntry>;
  layout: (props: {
    children: import("@vincle/core").VNode;
  }) => import("@vincle/core").VNode;
}

export interface Page {
  url: string;
  file: string;
  outPath: string;
  handler: string;
  meta: PageMeta;
  Component: (props: object) => import("@vincle/core").VNode;
}
