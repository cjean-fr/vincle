import type { PageHandler } from "@vincle/ssg";

import grayMatter from "gray-matter";
import { readFile } from "node:fs/promises";

import { mdxCache } from "../lib/mdx-cache.js";

export const MdxHandler: PageHandler = {
  name: "mdx",
  async load(source) {
    const text = await readFile(source.file, "utf8");
    const { data: meta } = grayMatter(text, {});
    // Keep compilation lazy so unpublished content is never compiled.
    return {
      meta,
      render(context) {
        return [
          {
            path: context.outputPath(),
            content: () =>
              context.runtime.render(async () => {
                const { Component } = await mdxCache.load(source.file, context.modules);
                return Component(context);
              }),
          },
          { path: context.outputPath(".md"), content: text, sitemap: false },
        ];
      },
    };
  },
};
