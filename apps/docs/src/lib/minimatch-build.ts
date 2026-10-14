import type { SsgPlugin } from "@vincle/ssg";

import { htmlToText } from "../lib/html-text.js";

interface PageForSearch {
  url: string;
  title: string;
  text: string;
}

/** Search consumes final pages; no rediscovery or filesystem build coupling. */
export function minimatchSearch(): SsgPlugin {
  return {
    name: "minimatch-search",
    async publish(context) {
      const groups = new Map<string, PageForSearch[]>();
      for (const page of context.outputs) {
        if (page.meta.search === false) continue;
        const locale = page.meta.locale ?? "en";
        const documents = groups.get(locale) ?? [];
        documents.push({
          url: page.url,
          title: page.meta.title ?? page.url,
          text: htmlToText(await page.read(), { mainOnly: true }),
        });
        groups.set(locale, documents);
      }
      for (const [locale, documents] of groups)
        await context.emit({
          path: locale === "en" ? "search-index.json" : `${locale}/search-index.json`,
          content: JSON.stringify(documents),
        });
    },
  };
}
