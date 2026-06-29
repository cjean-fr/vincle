import { writeFile } from "node:fs/promises";

export interface PageForSearch {
  url: string;
  title: string;
  text: string;
}

function stripHtml(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const body = main ? main[1]! : html;
  const noBlocks = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ");
  return noBlocks
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/\s+/g, " ")
    .trim();
}

export async function buildMinimatchIndex(
  pages: { url: string; title: string; html: string }[],
  outPath: string,
): Promise<void> {
  const docs: PageForSearch[] = pages.map((page) => ({
    url: page.url,
    title: page.title,
    text: stripHtml(page.html),
  }));

  await writeFile(outPath, JSON.stringify(docs), "utf-8");
  console.log(`[minimatch] Indexed ${pages.length} pages -> ${outPath}`);
}
