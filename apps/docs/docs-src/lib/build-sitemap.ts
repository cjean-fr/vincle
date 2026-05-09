import { writeFile } from "node:fs/promises";
import path from "node:path";

export interface SitemapPage {
  url: string;
  draft?: boolean;
}

export async function buildSitemap(
  pages: SitemapPage[],
  siteUrl: string,
  outDir: string,
): Promise<void> {
  const visible = pages.filter((p) => !p.draft);
  if (visible.length === 0) return;

  const base = siteUrl.replace(/\/+$/, "");

  const urls = visible
    .map((p) => {
      const loc = base + p.url;
      const depth = p.url === "/" ? 0 : p.url.split("/").filter(Boolean).length;
      const priority = Math.max(0.3, 1.0 - depth * 0.2).toFixed(1);
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

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
