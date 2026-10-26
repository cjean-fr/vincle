import { createMdxHandler, type MdxOptions } from "@vincle/ssg/mdx";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineHastPlugin, type MdxCompileOptions } from "satteri";

import { codeBlocks, mermaidBlocks } from "./code-blocks.js";
import { fenceTabs, wrapTables } from "./hast-plugins.js";
import { t } from "./messages.js";
import { setToc, type TocEntry } from "./toc.js";

/**
 * Gives each heading its id, a permalink on h2–h4, and records h2–h3 in
 * `toc`: the table of contents comes from the source, never from HTML.
 */
function headingPlugin(ids: readonly string[], toc: TocEntry[]) {
  let index = 0;
  const label = t("sectionLink");
  return defineHastPlugin({
    name: "heading-ids",
    element: {
      filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
      visit(node, ctx) {
        const text = ctx.textContent(node);
        const id =
          ids[index++] ??
          text
            .normalize("NFKD")
            .replace(/\p{M}/gu, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        if (!id) return;
        ctx.setProperty(node, "id", id);
        // A visually hidden heading (GFM footnotes) is neither listed nor linked.
        const className = node.properties["className"];
        if (Array.isArray(className) ? className.includes("sr-only") : className === "sr-only")
          return;
        const level = Number(node.tagName[1]);
        if (level === 2 || level === 3)
          toc.push({ id, text: text.replace(/\s+/g, " ").trim(), level });
        if (level >= 2 && level <= 4)
          ctx.appendChild(node, {
            type: "element",
            tagName: "a",
            properties: { className: ["docs-heading-anchor"], href: `#${id}`, "aria-label": label },
            children: [{ type: "text", value: "#" }],
          });
      },
    },
  });
}

const compileOptions: MdxCompileOptions = {
  jsxImportSource: "@vincle/core",
  optimizeStatic: {
    component: "RawHtml",
    prop: "html",
    // Preserve Vincle's serialization for elements carrying special attributes.
    ignoreElements: ["button", "th", "td", "a", "section"],
  },
  providerImportSource: pathToFileURL(path.resolve(import.meta.dirname, "../components/mdx.tsx"))
    .href,
};

export const docsMdxOptions: MdxOptions<{ toc: TocEntry[] }> = {
  compile: compileOptions,
  prepare({ meta }) {
    const ids = Array.isArray(meta["headingIds"])
      ? meta["headingIds"].filter((id): id is string => typeof id === "string")
      : [];
    const toc: TocEntry[] = [];
    return {
      data: { toc },
      createPlugins() {
        toc.length = 0;
        return [fenceTabs, mermaidBlocks(), codeBlocks, headingPlugin(ids, toc), wrapTables];
      },
    };
  },
};

export const MdxHandler = createMdxHandler({
  ...docsMdxOptions,
  beforeRender({ data }) {
    setToc(data.toc);
  },
});
