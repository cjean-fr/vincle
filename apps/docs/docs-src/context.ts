import { Scope, type ScopeKey } from "@vincle/core";

import type { NavLink } from "./lib/sidebar.js";
import type { ResolvedDocsConfig, PageMeta, ResolvedSidebar, TabConfig } from "./types.js";

export interface DocsRenderContext {
  config: ResolvedDocsConfig;
  currentPage: string;
  meta: PageMeta;
  sidebar: ResolvedSidebar;
  /** The tab matching the current page (null on tab-less pages like home). */
  currentTab: TabConfig | null;
  /** Resolved tab links with href pointing to each tab's first page. */
  resolvedTabs: ReadonlyArray<{ label: string; slug: string; href: string }>;
  lastUpdated: string | null;
  editUrl: string | null;
  prev: NavLink | null;
  next: NavLink | null;
}

const DocsContext: ScopeKey<DocsRenderContext> =
  Scope.key<DocsRenderContext>("@vincle/docs:render");

export function setDocs(value: DocsRenderContext): void {
  Scope.set(DocsContext, value);
}

export function useDocs(): DocsRenderContext {
  return Scope.get(DocsContext);
}
