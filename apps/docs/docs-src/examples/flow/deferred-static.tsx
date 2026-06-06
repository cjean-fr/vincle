import type { JSX } from "@vincle/core";

import { renderToStatic } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";
import { writeFile } from "node:fs/promises";

declare const pages: { Component: () => JSX.Element; out: string }[];

// Pages use <Template> with lazy factories: emit fragment files after rendering all pages.
await renderToStatic(
  async (ctx) => {
    for (const page of pages) {
      const html = await ctx.renderPage(() => <page.Component />);
      await writeFile(page.out, "<!DOCTYPE html>\n" + html);
    }

    // One .html file per deferred fragment — already
    // Frame-wrapped, ready to write.
    await ctx.emitFragments((_id, url, html) => writeFile("./dist" + url, html));
  },
  { adapter: NativeAdapter },
);
