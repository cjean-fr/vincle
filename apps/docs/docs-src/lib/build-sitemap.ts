import { writeFile } from "node:fs/promises";
import path from "node:path";

import { fullUrl } from "./full-url.js";

export interface SitemapPage {
  url: string;
  draft?: boolean;
  alternates?: ReadonlyArray<{ locale: string; href: string }>;
}

export async function buildSitemap(
  pages: SitemapPage[],
  siteUrl: string,
  outDir: string,
  base = "/",
): Promise<void> {
  const visible = pages.filter((p) => !p.draft);
  if (visible.length === 0) return;

  const limit = 50_000;
  if (visible.length <= limit) {
    await writeSitemap(visible, siteUrl, outDir, "sitemap.xml", base);
  } else {
    const entries: string[] = [];
    for (let start = 0; start < visible.length; start += limit) {
      const name = `sitemap-${start / limit + 1}.xml`;
      await writeSitemap(visible.slice(start, start + limit), siteUrl, outDir, name, base);
      entries.push(
        `  <sitemap>\n    <loc>${escapeXml(fullUrl("/" + name, siteUrl, base))}</loc>\n  </sitemap>`,
      );
    }
    await writeFile(
      path.join(outDir, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</sitemapindex>\n`,
      "utf-8",
    );
  }
  console.log(`[sitemap] Generated sitemap.xml with ${visible.length} URLs`);
}

async function writeSitemap(
  pages: SitemapPage[],
  siteUrl: string,
  outDir: string,
  name: string,
  base: string,
): Promise<void> {
  const urls = pages
    .map((p) => {
      const loc = fullUrl(p.url, siteUrl, base);
      const alternates = (p.alternates ?? []).map(
        ({ locale, href }) =>
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(locale)}" href="${escapeXml(fullUrl(href, siteUrl, base))}" />`,
      );
      const english = p.alternates?.find(({ locale }) => locale === "en");
      if (english)
        alternates.push(
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(fullUrl(english.href, siteUrl, base))}" />`,
        );
      const depth = p.url === "/" ? 0 : p.url.split("/").filter(Boolean).length;
      const priority = Math.max(0.3, 1.0 - depth * 0.2).toFixed(1);
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n${alternates.length ? alternates.join("\n") + "\n" : ""}    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
  await writeFile(path.join(outDir, name), xml, "utf-8");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
