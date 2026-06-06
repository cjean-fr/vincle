import type { JSX } from "@vincle/core";

import { renderToStatic } from "@vincle/flow";
import { writeFile } from "node:fs/promises";

declare const pages: { Component: () => JSX.Element; out: string }[];

// Pure-static: no lazy <Template>, no adapter needed.
await renderToStatic(async (ctx) => {
  await Promise.all(
    pages.map(async (page) => {
      const html = await ctx.renderPage(() => <page.Component />);
      await writeFile(page.out, "<!DOCTYPE html>\n" + html);
    }),
  );
});
