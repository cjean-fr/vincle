import { raw, renderToString } from "@vincle/core";
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ModuleLoader } from "./types.js";

import { discoverPages } from "./handlers.js";
import { renderPage } from "./lifecycle.js";
import { createMdxHandler, MdxCache } from "./mdx.js";
import { loadModule } from "./module.js";

async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.resolve(import.meta.dirname, "../.mdx-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("metadata discovery defers MDX compilation and publishes HTML plus original Markdown", () =>
  fixture(async (src) => {
    const text = "---\ntitle: Article\n---\n# Hello\n\nA paragraph.\n";
    await writeFile(path.join(src, "index.mdx"), text);
    await writeFile(path.join(src, "draft.mdx"), "---\ntitle: Draft\n---\n{ broken syntax");
    let imports = 0;
    let hooks = 0;
    const modules: ModuleLoader = {
      load: async () => {
        imports++;
        throw new Error("Unexpected import");
      },
    };
    const pages = await discoverPages({
      src,
      modules,
      handlers: {
        ".mdx": createMdxHandler({
          beforeRender(compiled, context) {
            expect(compiled.meta.title).toBe(context.meta.title);
            hooks++;
          },
        }),
      },
    });
    expect(pages.map((page) => page.meta.title)).toEqual(["Draft", "Article"]);
    expect(imports).toBe(0);
    const outputs = [];
    for await (const output of renderPage(pages[1]!)) outputs.push(output);
    expect(outputs[0]!.content).toContain("<h1>Hello</h1>");
    expect(outputs[1]!.content).toBe(text);
    expect(outputs[1]!.sitemap).toBe(false);
    expect(hooks).toBe(1);
    expect(imports).toBe(0);
  }));

test("static Markdown preserves Core URL policy and executable MDX uses the active module loader", () =>
  fixture(async (src) => {
    const file = path.join(src, "article.mdx");
    let imports = 0;
    const modules: ModuleLoader = {
      load: (...args) => {
        imports++;
        return loadModule(...args);
      },
    };
    const cache = new MdxCache();
    await writeFile(file, "[unsafe](javascript:alert%281%29) ![image](javascript:foo)");
    const staticPage = await cache.load(file, modules);
    const html = await renderToString(staticPage.Component({}));
    expect(html).toContain('href="#blocked"');
    expect(html).toContain('src="#blocked"');
    expect(imports).toBe(0);
    await writeFile(file, '{"Executed"}');
    const executable = await cache.load(file, modules);
    expect(await renderToString(executable.Component({}))).toContain("Executed");
    expect(imports).toBe(1);
  }));

test("cache deduplicates concurrent loads but separates loaders, source edits and runtimes", () =>
  fixture(async (src) => {
    const file = path.join(src, "article.mdx");
    await writeFile(file, '{"A"}');
    let imports = 0;
    const modules: ModuleLoader = {
      async load(_file, source, code) {
        imports++;
        expect(code).toContain(source + "/jsx-runtime");
        return { default: () => raw("loaded") };
      },
    };
    const cache = new MdxCache();
    const [a, b] = await Promise.all([cache.load(file, modules), cache.load(file, modules)]);
    expect(a).toBe(b);
    expect(imports).toBe(1);
    await cache.load(file, { ...modules });
    await cache.load(file, modules, "other-runtime");
    expect(imports).toBe(3);
    await writeFile(file, '{"B"}');
    expect(await cache.load(file, modules)).not.toBe(a);
    expect(imports).toBe(4);
    cache.invalidate(file);
    await cache.load(file, modules);
    expect(imports).toBe(5);
    cache.clear();
    await cache.load(file, modules);
    expect(imports).toBe(6);
  }));

test("a component provider disables the direct HTML shortcut unless explicitly optimized", () =>
  fixture(async (src) => {
    const file = path.join(src, "article.mdx");
    await writeFile(file, "# Hello");
    let imports = 0;
    const cache = new MdxCache({ compile: { providerImportSource: "custom-provider" } });
    const page = await cache.load(file, {
      async load(_file, _source, code) {
        imports++;
        expect(code).toContain("custom-provider");
        return { default: () => raw("custom heading") };
      },
    });
    expect(await renderToString(page.Component({}))).toBe("custom heading");
    expect(imports).toBe(1);
  }));

test("default MDX preserves named metadata, sitemap overrides and additional outputs", () =>
  fixture(async (src) => {
    await writeFile(
      path.join(src, "article.mdx"),
      [
        "---",
        "title: Frontmatter",
        "description: Original",
        "---",
        'export const meta = {title: "Exported"}',
        "export const sitemap = false",
        'export const outputs = ({meta, outputPath}) => ({path: outputPath(".json"), content: JSON.stringify(meta)})',
        "",
        "# Article",
      ].join("\n"),
    );
    const [page] = await discoverPages({ src });
    expect(page!.meta).toMatchObject({
      title: "Exported",
      description: "Original",
      sitemap: false,
    });
    const outputs = [];
    for await (const output of renderPage(page!)) outputs.push(output);
    expect(outputs).toHaveLength(3);
    expect(outputs[0]!.content).toContain("<h1>Article</h1>");
    expect(outputs[0]!.sitemap).toBe(false);
    expect(JSON.parse(String(outputs[2]!.content))).toMatchObject({
      title: "Exported",
      description: "Original",
    });
  }));

test("default plain Markdown keeps MDX expressions and exports as text", () =>
  fixture(async (src) => {
    await writeFile(
      path.join(src, "plain.md"),
      '# Plain\n\n{1 + 2}\n\nexport const meta = {title: "Literal"}',
    );
    const [page] = await discoverPages({ src });
    expect(page!.meta.title).toBeUndefined();
    const outputs = [];
    for await (const output of renderPage(page!)) outputs.push(output);
    expect(outputs[0]!.content).toContain("{1 + 2}");
    expect(outputs[0]!.content).toContain("export const meta");
  }));
