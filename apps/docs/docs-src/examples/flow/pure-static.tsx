import { renderToStatic } from "@vincle/flow";
import type { JSX } from "@vincle/core";
import { writeFile } from "node:fs/promises";

declare const pages: { Component: () => JSX.Element; out: string }[];

// Pure-static: no <Defer>, no adapter needed.
await renderToStatic(async (ctx) => {
  for (const page of pages) {
    const html = await ctx.renderPage(() => <page.Component />);
    await writeFile(page.out, "<!DOCTYPE html>\n" + html);
  }
});
