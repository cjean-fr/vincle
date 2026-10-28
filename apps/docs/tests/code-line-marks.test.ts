import type { ModuleLoader } from "@vincle/ssg";

import { renderToString } from "@vincle/core";
import { discoverPages } from "@vincle/ssg";
import { MdxCache } from "@vincle/ssg/mdx";
import { beforeAll, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { docsMdxOptions } from "../src/lib/mdx.js";

const PAGES_DIR = path.resolve(import.meta.dirname, "../src/pages");
const APP_DIR = path.resolve(import.meta.dirname, "..");

let modules: ModuleLoader;
beforeAll(async () => {
  const [page] = await discoverPages({ src: path.join(PAGES_DIR, "guide/getting-started") });
  modules = page!.source.modules;
});

/** Inside the app, so compiled MDX resolves @vincle/core from its node_modules. */
const fixtureDirectory = (prefix: string) => mkdtemp(path.join(APP_DIR, `.${prefix}-`));

it("marks the lines listed in a fence's {1,3-5} meta", async () => {
  const directory = await fixtureDirectory("mdx-marks-test");
  const file = path.join(directory, "page.mdx");
  try {
    await writeFile(
      file,
      '---\ntitle: Marks\n---\n```js {2,4-5} title="sample.js"\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;\n```\n',
    );
    const { Component } = await new MdxCache(docsMdxOptions).load(file, modules);
    const html = await renderToString(Component({}));
    expect(html).toContain("has-marks");
    // Lines 2, 4 and 5 are washed, the others keep their plain class.
    expect(html.match(/class="line mark"/g) ?? []).toHaveLength(3);
    // Lines 1 and 3 stay plain; the trailing empty line is trimmed.
    expect(html.match(/class="line"/g) ?? []).toHaveLength(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("leaves blocks without marks untouched", async () => {
  const directory = await fixtureDirectory("mdx-no-marks-test");
  const file = path.join(directory, "page.mdx");
  try {
    await writeFile(file, "---\ntitle: No marks\n---\n```js\nconst a = 1;\n```\n");
    const { Component } = await new MdxCache(docsMdxOptions).load(file, modules);
    const html = await renderToString(Component({}));
    expect(html).not.toContain("has-marks");
    expect(html).not.toContain("mark");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
