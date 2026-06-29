import { pathToFileURL } from "node:url";
import type { PageHandler, Page, ResolvedDocsConfig } from "../types.js";
import { getRelativeRoute, createPage } from "../lib/page-utils.js";

export const JsxHandler: PageHandler = {
  name: "jsx",

  async load(
    file: string,
    pagesDir: string,
    config: ResolvedDocsConfig,
  ): Promise<Page> {
    const rel = getRelativeRoute(file, pagesDir);
    const mod = await import(pathToFileURL(file).href);
    const Component = mod["default"];
    if (typeof Component !== "function") {
      throw new Error(
        `[@vincle/docs] ${rel} has no default export, or it is not a function.`,
      );
    }
    return createPage(
      file,
      pagesDir,
      config,
      this.name,
      mod["meta"],
      Component,
    );
  },
};
