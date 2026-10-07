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

  const urls = visible
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

  await writeFile(path.join(outDir, "sitemap.xml"), xml, "utf-8");
  console.log(`[sitemap] Generated sitemap.xml with ${visible.length} URLs`);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
