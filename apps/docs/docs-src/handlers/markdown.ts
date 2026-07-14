import { raw } from "@vincle/core";

import type { PageHandler, Page, ResolvedDocsConfig } from "../types.js";

import { processMarkdown } from "../lib/markdown.js";
import { createPage } from "../lib/page-utils.js";

export const MarkdownHandler: PageHandler = {
  name: "md",

  async load(file: string, pagesDir: string, config: ResolvedDocsConfig): Promise<Page> {
    const { html, meta: rawMeta } = await processMarkdown(file);
    const rendered = raw(html);
    return createPage(file, pagesDir, config, this.name, rawMeta, () => rendered);
  },
};
