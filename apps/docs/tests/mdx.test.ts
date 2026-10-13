import type { ModuleLoader } from "@vincle/ssg";

import { raw, renderToString } from "@vincle/core";
import { discoverPages } from "@vincle/ssg";
import { MdxCache } from "@vincle/ssg/mdx";
import { beforeAll, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { docsMdxOptions } from "../src/lib/mdx.js";

const PAGES_DIR = path.resolve(import.meta.dirname, "../src/pages");

const APP_DIR = path.resolve(import.meta.dirname, "..");

function freshCache() {
  return new MdxCache(docsMdxOptions);
}

/** SSG's own module loader, counting the modules MDX actually imports. */
let imports = 0;
let modules: ModuleLoader;
beforeAll(async () => {
  const [page] = await discoverPages({ src: path.join(PAGES_DIR, "guide/getting-started") });
  const loader = page!.source.modules;
  modules = { load: (...args) => (imports++, loader.load(...args)) };
});

/** Inside the app, so compiled MDX resolves @vincle/core from its node_modules. */
const fixtureDirectory = (prefix: string) => mkdtemp(path.join(APP_DIR, `.${prefix}-`));

it("renders static Markdown without importing a module, preserving component overrides", async () => {
  const directory = await fixtureDirectory("mdx-static-test");
  const file = path.join(directory, "page.mdx");
  try {
    await writeFile(file, "---\ntitle: Static page\n---\n# Static heading\n\nA paragraph.\n");
    const before = imports;
    const { Component } = await freshCache().load(file, modules);
    expect(await renderToString(Component({}))).toContain(
      '<h1 id="static-heading">Static heading</h1>',
    );
    expect(imports).toBe(before);
    expect(
      await renderToString(Component({ components: { RawHtml: () => raw("override") } })),
    ).toBe("override");
    expect(imports).toBe(before + 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("keeps highlighted code and Markdown URLs static, but loads executable MDX", async () => {
  const directory = await fixtureDirectory("mdx-runtime-test");
  try {
    const file = path.join(directory, "page.mdx");
    await writeFile(
      file,
      [
        "---",
        "title: Code page",
        "---",
        "# Code",
        "",
        "[link](javascript:alert%281%29) ![image](javascript:foo)",
        "",
        "```tsx",
        'import { renderToString } from "@vincle/core";',
        'const html = await renderToString(<h1>{"Hello"}</h1>);',
        "```",
        "",
      ].join("\n"),
    );
    const before = imports;
    const { Component } = await freshCache().load(file, modules);
    const html = await renderToString(Component({}));
    expect(html).toContain('class="docs-code-block"');
    expect(html).toContain("<button");
    expect(html).toContain('class="hljs-keyword"');
    expect(html).toContain('href="#blocked"');
    expect(html).toContain('src="#blocked"');
    expect(html).not.toContain('href="javascript:');
    expect(imports).toBe(before);
    await writeFile(
      file,
      '---\ntitle: Runtime page\n---\nimport { raw } from "@vincle/core"\n\n{raw("<p>Executed</p>")}\n',
    );
    const runtime = await freshCache().load(file, modules);
    expect(await renderToString(runtime.Component({}))).toContain("<p>Executed</p>");
    expect(imports).toBe(before + 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
