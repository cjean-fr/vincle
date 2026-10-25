import { expect, it } from "bun:test";

import type { DocsRenderContext } from "../src/lib/context.js";

import config from "../docs.config.js";
import { getHeaders, getStructuredData } from "../src/lib/seo.js";

function page(currentPage: string, title: string): DocsRenderContext {
  return {
    config,
    currentPage,
    meta: { title },
    sidebar: { groups: [] },
    currentTab: null,
    resolvedTabs: [],
    lastUpdated: null,
    editUrl: null,
    prev: null,
    next: null,
  };
}

it("keeps a stable website name separate from each descriptive page title", () => {
  for (const context of [
    page("/", "JSX for the server"),
    page("/guide/introduction", "Introduction"),
  ]) {
    expect(getStructuredData(context)).toMatchObject({
      "@type": "WebSite",
      name: "Vincle",
      url: "https://vincle.cjean.fr/",
    });
    expect(getHeaders(context).title).toBe(`${context.meta.title} - Vincle`);
    expect(getHeaders(context).canonical).toBe(`https://vincle.cjean.fr${context.currentPage}`);
  }
});

it("does not declare a website on an error page", () => {
  expect(getStructuredData(page("/404", "Not found"))).toBeUndefined();
});
