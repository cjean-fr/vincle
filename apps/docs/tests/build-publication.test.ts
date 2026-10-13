import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { DocsRenderContext } from "../src/lib/context.js";

import config from "../docs.config.js";
import { discoverDocumentation } from "../src/lib/documentation.js";
import { discoverPages } from "../src/lib/pages.js";

// Every output (HTML, Markdown, sitemap, search, llms) derives from discovered
// pages: excluding a page here excludes it everywhere.
test("published_at decides which pages are published", async () => {
  const pages = await mkdtemp(path.join(tmpdir(), "vincle-docs-publication-"));
  const fixture = { ...config, pages };
  const page = (name: string, header: string, body: string) =>
    writeFile(
      path.join(pages, "guide", `${name}.mdx`),
      `---\ntitle: ${name}\n${header}---\n\n${body}`,
    );
  const urls = async (now: Date) =>
    (await discoverPages(fixture, now)).map((item) => item.url).toSorted();
  try {
    await mkdir(path.join(pages, "guide"));
    await writeFile(path.join(pages, "index.mdx"), "---\ntitle: Home\n---\n# Home");
    await page("ready", "published_at: 2000-01-01\n", "# Ready");
    await page("undated", "", "# Undated");
    // Invalid MDX proves scheduled content is not compiled before publication.
    await page("later", 'published_at: "2100-01-01"\n', "# Scheduled\n\n{ broken syntax");

    expect(await urls(new Date("2050-01-01"))).toEqual(["/", "/guide/ready", "/guide/undated"]);
    expect(await urls(new Date("2100-01-01"))).toContain("/guide/later");

    await page("later", 'published_at: "invalid"\n', "# Invalid date");
    await expect(urls(new Date())).rejects.toThrow(/later.mdx: published_at must be an ISO date/);
  } finally {
    await rm(pages, { recursive: true, force: true });
  }
});

test("a later discovery does not replace an earlier page's navigation context", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vincle-docs-context-"));
  const originalPages = config.pages;
  try {
    for (const name of ["old", "new"]) {
      const pages = path.join(directory, name);
      await mkdir(path.join(pages, "guide"), { recursive: true });
      await writeFile(
        path.join(pages, "guide", `${name}.mdx`),
        `---\ntitle: ${name} page\n---\n# Content`,
      );
    }
    config.pages = path.join(directory, "old");
    const [oldPage] = await discoverDocumentation({});
    config.pages = path.join(directory, "new");
    const [newPage] = await discoverDocumentation({});
    const resolveOld = oldPage!.meta["documentation"] as () => Promise<DocsRenderContext>;
    const resolveNew = newPage!.meta["documentation"] as () => Promise<DocsRenderContext>;
    const oldContext = await resolveOld();
    const newContext = await resolveNew();
    expect(JSON.stringify(oldContext.sidebar)).toContain("old page");
    expect(JSON.stringify(oldContext.sidebar)).not.toContain("new page");
    expect(JSON.stringify(newContext.sidebar)).toContain("new page");
    expect(oldContext.resolvedTabs[0]!.href).toBe("/guide/old");
    expect(newContext.resolvedTabs[0]!.href).toBe("/guide/new");
  } finally {
    config.pages = originalPages;
    await rm(directory, { recursive: true, force: true });
  }
});
