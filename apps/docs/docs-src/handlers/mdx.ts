import grayMatter from "gray-matter";
import { readFile } from "node:fs/promises";

import type { PageHandler, Page, ResolvedDocsConfig } from "../types.js";

import { mdxCache } from "../lib/mdx-cache.js";
import { createPage } from "../lib/page-utils.js";

export const MdxHandler: PageHandler = {
  name: "mdx",

  async load(file: string, pagesDir: string, config: ResolvedDocsConfig): Promise<Page> {
    // Discovery needs metadata only. Compile on render so the build's bounded
    // render pool also bounds compilation and does not retain every Component.
    const { data: meta } = grayMatter(await readFile(file, "utf-8"), {});
    return createPage(file, pagesDir, config, this.name, meta, async (props) => {
      const { Component } = await mdxCache.load(file);
      return Component(props);
    });
  },
};
