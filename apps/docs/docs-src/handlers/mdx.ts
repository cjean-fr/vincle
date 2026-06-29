import { mdxCache } from "../lib/mdx-cache.js";
import { getRelativeRoute, createPage } from "../lib/page-utils.js";
import type { PageHandler, Page, ResolvedDocsConfig } from "../types.js";

export const MdxHandler: PageHandler = {
  name: "mdx",

  async load(
    file: string,
    pagesDir: string,
    config: ResolvedDocsConfig,
  ): Promise<Page> {
    const rel = getRelativeRoute(file, pagesDir);
    const { Component, meta } = await mdxCache.load(file);
    if (typeof Component !== "function") {
      throw new Error(
        `[@vincle/docs] Compiled MDX ${rel} has no default export.`,
      );
    }
    return createPage(file, pagesDir, config, this.name, meta, Component);
  },
};
