import { open } from "node:fs/promises";

import { htmlToText } from "../lib/html-text.js";

interface PageForSearch {
  url: string;
  title: string;
  text: string;
}

export async function buildMinimatchIndex(
  pages:
    | Iterable<{ url: string; title: string; html: string }>
    | AsyncIterable<{ url: string; title: string; html: string }>,
  outPath: string,
): Promise<void> {
  const file = await open(outPath, "w");
  let count = 0;
  try {
    await file.writeFile("[");
    for await (const page of pages) {
      const doc: PageForSearch = {
        url: page.url,
        title: page.title,
        text: htmlToText(page.html, { mainOnly: true }),
      };
      await file.writeFile((count++ ? "," : "") + JSON.stringify(doc));
    }
    await file.writeFile("]");
  } finally {
    await file.close();
  }
  console.log(`[minimatch] Indexed ${count} pages -> ${outPath}`);
}
