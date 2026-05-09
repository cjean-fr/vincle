import { describe, expect, it } from "bun:test";

import type { Page, PageMeta, ResolvedDocsConfig, TabConfig } from "../types.js";

import config from "../../docs.config.js";
import { clearMetaCache, resolveNavigation, resolveSidebar, tabFor } from "./sidebar.js";

const TABS: TabConfig[] = [
  { label: "Guide", slug: "guide" },
  { label: "API", slug: "api" },
];

/** `resolveSidebar` ne lit que `url` et `meta.title`. */
const page = (url: string, title: string): Page & { meta: PageMeta } =>
  ({ url, meta: { title } }) as Page & { meta: PageMeta };

describe("tabFor", () => {
  it("matches the first segment", () => {
    expect(tabFor(TABS, "/guide/introduction")?.slug).toBe("guide");
    expect(tabFor(TABS, "/api/core/raw")?.slug).toBe("api");
    expect(tabFor(TABS, "/guide")?.slug).toBe("guide");
  });

  it("returns null when no tab owns the URL", () => {
    // This used to fall back to the guide: `/privacy` got the guide's
    // sidebar, with no active tab to explain why.
    expect(tabFor(TABS, "/privacy")).toBeNull();
    expect(tabFor(TABS, "/")).toBeNull();
    expect(tabFor(TABS, "")).toBeNull();
  });

  it("gives the same answer to every caller", () => {
    // Navigation and the sidebar used to answer separately, and diverged.
    for (const url of ["/privacy", "/", "/guide/x", "/api"]) {
      expect(tabFor(config.tabs, url)).toBe(tabFor(config.tabs, url));
    }
  });
});

describe("resolveSidebar", () => {
  const pages = [
    page("/guide/introduction", "Introduction"),
    page("/guide/security", "Security"),
    page("/api/core/raw", "raw"),
    page("/privacy", "Privacy"),
  ];
  const withPages = (): ResolvedDocsConfig => ({ ...config, tabs: TABS });

  it("is empty for a page no tab owns", async () => {
    clearMetaCache();
    const sidebar = await resolveSidebar(withPages(), pages, "/privacy");
    expect(sidebar.groups).toEqual([]);
  });

  it("lists the pages of the current tab, and only those", async () => {
    clearMetaCache();
    const sidebar = await resolveSidebar(withPages(), pages, "/guide/introduction");
    const hrefs = JSON.stringify(sidebar.groups);
    expect(hrefs).toContain("/guide/introduction");
    expect(hrefs).not.toContain("/api/core/raw");
    expect(hrefs).not.toContain("/privacy");
  });

  it("marks the current page", async () => {
    clearMetaCache();
    const sidebar = await resolveSidebar(withPages(), pages, "/guide/security");
    const flat = JSON.stringify(sidebar.groups);
    expect(flat).toContain('"current":true');
  });
});

describe("resolveNavigation", () => {
  it("has neither previous nor next outside the sidebar", () => {
    const { prev, next } = resolveNavigation({ groups: [] }, "/privacy");
    expect({ prev, next }).toEqual({ prev: null, next: null });
  });

  it("links the neighbours in reading order", () => {
    const sidebar = {
      groups: [
        {
          label: null,
          items: [
            { kind: "page", label: "A", href: "/guide/a", current: false },
            { kind: "page", label: "B", href: "/guide/b", current: true },
            { kind: "page", label: "C", href: "/guide/c", current: false },
          ],
        },
      ],
    } as Parameters<typeof resolveNavigation>[0];
    expect(resolveNavigation(sidebar, "/guide/b")).toEqual({
      prev: { label: "A", href: "/guide/a" },
      next: { label: "C", href: "/guide/c" },
    });
  });
});
