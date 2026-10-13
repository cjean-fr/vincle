import { Scope } from "@vincle/core";
import { renderToString, type JSX } from "@vincle/core";
import { setVite } from "@vincle/vite-plugin";
import { describe, expect, it } from "bun:test";

import type { PageMeta, ResolvedDocsConfig } from "../src/lib/types.js";

import { Layout } from "../src/components/Layout.js";
import { setDocs, type DocsRenderContext } from "../src/lib/context.js";

const config: ResolvedDocsConfig = {
  title: "Vincle",
  tagline: "Documentation",
  description: "The small, safe way to render JSX into HTML strings.",
  pages: "src/pages",
  clientEntry: "src/_client/main.ts",
  base: "/",
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
  return Scope.with(async () => {
    setVite(null, { base: "/" });
    setDocs(docsContext(meta));
    const body: JSX.Element = <main>body</main>;
    // Called as a function, like `config.layout(...)` in the build pipeline,
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

it("uses the page base for canonical metadata independently of the Vite asset base", async () => {
  const html = await Scope.with(async () => {
    setVite(null, { base: "/bundles/" });
    setDocs({
      ...docsContext({ title: "Guide" }),
      config: {
        ...config,
        site: "https://example.test/project/",
        base: "/docs/",
      },
      currentPage: "/fr/guide",
      alternates: [
        { locale: "en", href: "/guide" },
        { locale: "fr", href: "/fr/guide" },
      ],
    });
    return renderToString(Layout({ children: <main>body</main> }));
  });
  expect(html).toContain('rel="canonical" href="https://example.test/project/docs/fr/guide"');
  expect(html).toContain('property="og:url" content="https://example.test/project/docs/fr/guide"');
  expect(html).toContain('hreflang="en" href="https://example.test/project/docs/guide"');
  expect(html).toContain('hreflang="x-default" href="https://example.test/project/docs/guide"');
  expect(html).toContain('src="/bundles/src/_client/main.ts"');
});

describe("Layout CSP", () => {
  it("authorizes the theme script by hash, and that hash matches the emitted bytes", async () => {
    const html = await renderPage();
    const csp = cspOf(html);
    const scriptSrc = directive(csp, "script-src");

    expect(scriptSrc).not.toContain("'unsafe-inline'");

    // The browser hashes the script's exact text content: the CSP must carry
    // the digest of what the page actually emits, not of a different string.
    const themeScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(themeScript, "the theme script must be emitted inline").toBeDefined();
    expect(scriptSrc).toContain(await sha256HashOf(themeScript!));
  });

  it("does not emit frame-ancestors: it is ignored in a meta CSP", async () => {
    expect(cspOf(await renderPage())).not.toContain("frame-ancestors");
  });

  it("keeps style-src 'unsafe-inline' for inline styles", async () => {
    expect(directive(cspOf(await renderPage()), "style-src")).toContain("'unsafe-inline'");
  });

  it("still honors a page's meta.csp override", async () => {
    const html = await renderPage({ title: "Test page", csp: "default-src 'none'" });
    expect(cspOf(html)).toBe("default-src 'none'");
  });
});

it("delegates metadata to the SEO header and JSON-LD to the footer", async () => {
  const html = await renderPage({ title: "Test page", description: "Documentation" });
  const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
  expect(head).toContain("<title>Test page - Vincle</title>");
  expect(head).toContain('rel="canonical"');
  expect(head).not.toContain("application/ld+json");
  expect(html.indexOf('type="application/ld+json"')).toBeGreaterThan(html.indexOf("</main>"));
});

it("loads blocking CSS in the head even when Vite serves JavaScript modules in dev", async () => {
  const html = await renderPage();
  const stylesheet = '<link rel="stylesheet" href="/src/_client/main.css">';
  expect(html).toContain(stylesheet);
  expect(html.indexOf(stylesheet)).toBeLessThan(html.indexOf("</head>"));
});
