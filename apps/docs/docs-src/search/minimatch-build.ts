import { writeFile } from "node:fs/promises";

import { htmlToText } from "../lib/html-text.js";

export interface PageForSearch {
  url: string;
  title: string;
  text: string;
}

export async function buildMinimatchIndex(
  pages: { url: string; title: string; html: string }[],
  outPath: string,
): Promise<void> {
  const docs: PageForSearch[] = pages.map((page) => ({
    url: page.url,
    title: page.title,
    text: htmlToText(page.html, { mainOnly: true }),
  }));

  await writeFile(outPath, JSON.stringify(docs), "utf-8");
  console.log(`[minimatch] Indexed ${pages.length} pages -> ${outPath}`);
}
