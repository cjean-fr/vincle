import { expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSitemap, type SitemapPage } from "./build-sitemap.js";

it("applies the deployment base to locations and all translation alternates", async () => {
  const out = await mkdtemp(join(tmpdir(), "vincle-sitemap-"));
  try {
    await buildSitemap(
      [
        {
          url: "/fr/guide",
          alternates: [
            { locale: "en", href: "/guide" },
            { locale: "fr", href: "/fr/guide" },
          ],
        },
        { url: "/draft", draft: true },
      ],
      "https://example.test/project/",
      out,
      "/docs/",
    );
    const xml = await readFile(join(out, "sitemap.xml"), "utf8");
    expect(xml).toContain("<loc>https://example.test/project/docs/fr/guide</loc>");
    expect(xml).toContain('hreflang="en" href="https://example.test/project/docs/guide"');
    expect(xml).toContain('hreflang="fr" href="https://example.test/project/docs/fr/guide"');
    expect(xml).toContain('hreflang="x-default" href="https://example.test/project/docs/guide"');
    expect(xml).not.toContain("draft");
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

it("keeps 50,000 visible URLs in a single sitemap", async () => {
  const out = await mkdtemp(join(tmpdir(), "vincle-sitemap-"));
  try {
    const pages: SitemapPage[] = Array.from({ length: 50_000 }, (_, i) => ({ url: `/page-${i}` }));
    pages.push({ url: "/draft", draft: true });
    await buildSitemap(pages, "https://example.test", out);
    const xml = await readFile(join(out, "sitemap.xml"), "utf8");
    expect(xml.match(/<url>/g)?.length).toBe(50_000);
    expect(xml).not.toContain("<sitemapindex");
    expect(xml).not.toContain("/draft");
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

it("splits beyond 50,000 URLs and publishes a sitemap index at sitemap.xml", async () => {
  const out = await mkdtemp(join(tmpdir(), "vincle-sitemap-"));
  try {
    const pages: SitemapPage[] = Array.from({ length: 100_001 }, (_, i) => ({ url: `/page-${i}` }));
    await buildSitemap(pages, "https://example.test/project/", out, "/docs/");
    const index = await readFile(join(out, "sitemap.xml"), "utf8");
    expect(index.includes("<sitemapindex")).toBe(true);
    expect(index.match(/<sitemap>/g)?.length).toBe(3);
    for (const [part, count] of [
      [1, 50_000],
      [2, 50_000],
      [3, 1],
    ]) {
      expect(index).toContain(`<loc>https://example.test/project/docs/sitemap-${part}.xml</loc>`);
      const xml = await readFile(join(out, `sitemap-${part}.xml`), "utf8");
      expect(xml.match(/<url>/g)?.length).toBe(count);
    }
    const last = await readFile(join(out, "sitemap-3.xml"), "utf8");
    expect(last).toContain("/page-100000</loc>");
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
