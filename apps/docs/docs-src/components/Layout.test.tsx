import { renderToString, withScope, type JSX } from "@vincle/core";
import { setVite } from "@vincle/vite-plugin";
import { describe, expect, it } from "bun:test";

import type { PageMeta, ResolvedDocsConfig } from "../types.js";

import { setDocs, type DocsRenderContext } from "../context.js";
import { Layout } from "./Layout.js";

const config: ResolvedDocsConfig = {
  title: "Vincle",
  tagline: "Documentation",
  description: "The small, safe way to render JSX into HTML strings.",
  pages: "docs-src/pages",
  examples: "docs-src/examples",
  clientEntry: "docs-src/client.ts",
  out: "dist",
  base: "/",
  viteManifest: "dist/assets/.vite/manifest.json",
  tabs: [{ label: "Guide", slug: "guide" }],
  editUrl: null,
  site: "https://vincle.cjean.fr",
  image: null,
  sitemap: true,
  handlers: {},
  layout: Layout,
};

function docsContext(meta: PageMeta): DocsRenderContext {
  return {
    config,
    currentPage: "/test",
    meta,
    sidebar: { groups: [] },
    currentTab: null,
    resolvedTabs: [{ label: "Guide", slug: "guide", href: "/guide" }],
    lastUpdated: null,
    editUrl: null,
    prev: null,
    next: null,
  };
}

async function renderPage(meta: PageMeta = { title: "Test page" }): Promise<string> {
  return withScope(async () => {
    setVite(null, { base: "/" });
    setDocs(docsContext(meta));
    const body: JSX.Element = <main>body</main>;
    // Called as a function, like `config.layout(...)` in the build pipeline —
    // an async component returning `Promise<JSX.Element>` is not accepted by
    // `JSX.ElementType` (double-`Awaitable`), so the JSX form can't be used here.
    return renderToString(Layout({ children: body }));
  });
}

function cspOf(html: string): string {
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
  expect(csp, "a Content-Security-Policy meta must be emitted").toBeDefined();
  return csp!;
}

function directive(csp: string, name: string): string {
  return (
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `)) ?? ""
  );
}

async function sha256HashOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
}

describe("Layout CSP", () => {
  it("authorizes the theme script by hash, and that hash matches the emitted bytes", async () => {
    const html = await renderPage();
    const csp = cspOf(html);
    const scriptSrc = directive(csp, "script-src");

    expect(scriptSrc).not.toContain("'unsafe-inline'");

    // The browser hashes the script's exact text content — the CSP must carry
    // the digest of what the page actually emits, not of a different string.
    const themeScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(themeScript, "the theme script must be emitted inline").toBeDefined();
    expect(scriptSrc).toContain(await sha256HashOf(themeScript!));
  });

  it("covers every external host the head loads (stylesheets + preconnects)", async () => {
    const html = await renderPage();
    const csp = cspOf(html);
    const head = html.slice(0, html.indexOf("</head>"));
    const links = [
      ...head.matchAll(/<link rel="(preconnect|stylesheet)" href="https:\/\/([^/"]+)/g),
    ];

    expect(links.length, "the head must still reference the font hosts").toBeGreaterThan(0);
    for (const [, , host] of links) {
      expect(csp, `host ${host} must be covered by the CSP`).toContain(`https://${host}`);
    }
  });

  it("does not emit frame-ancestors — it is ignored in a meta CSP", async () => {
    expect(cspOf(await renderPage())).not.toContain("frame-ancestors");
  });

  it("keeps style-src 'unsafe-inline' — expressive-code emits per-token style attributes", async () => {
    expect(directive(cspOf(await renderPage()), "style-src")).toContain("'unsafe-inline'");
  });

  it("still honors a page's meta.csp override", async () => {
    const html = await renderPage({ title: "Test page", csp: "default-src 'none'" });
    expect(cspOf(html)).toBe("default-src 'none'");
  });
});
