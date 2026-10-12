import { raw, renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { codeHighlighter } from "./code-highlighter.js";
import { COMPILED_DIR, MdxCache } from "./mdx-cache.js";

const PAGES_DIR = path.resolve(import.meta.dirname, "../pages");
const SCOPE_MDX = path.join(PAGES_DIR, "api/core/scope.mdx");
const INSTALL_MDX = path.join(PAGES_DIR, "guide/getting-started/installation.mdx");

function freshCache(): MdxCache {
  return new MdxCache();
}

describe("MdxCache", () => {
  it("loads a real MDX file and returns Component + meta", async () => {
    const cache = freshCache();
    const { Component, meta } = await cache.load(SCOPE_MDX);

    expect(typeof Component).toBe("function");
    expect(meta["title"]).toBe("Context & Scope");
  });

  it("returns the same Component reference on cache hit", async () => {
    const cache = freshCache();
    const first = await cache.load(SCOPE_MDX);
    const second = await cache.load(SCOPE_MDX);

    expect(first.Component).toBe(second.Component);
    expect(first.meta).toBe(second.meta);
  });

  it("renders new content after an MDX file changes", async () => {
    const sourceRoot = path.join(PAGES_DIR, ".compiled");
    await mkdir(sourceRoot, { recursive: true });
    const directory = await mkdtemp(path.join(sourceRoot, "mdx-cache-test-"));
    const file = path.join(directory, "page.mdx");
    try {
      const cache = freshCache();
      await writeFile(file, "---\ntitle: Edited page\n---\n# Before edit\n");
      const before = await cache.load(file);
      expect(await renderToString(before.Component({}))).toContain("Before edit");

      await writeFile(file, "---\ntitle: Edited page\n---\n# After edit\n");
      const after = await cache.load(file);
      expect(await renderToString(after.Component({}))).toContain("After edit");
      expect(await renderToString(after.Component({}))).not.toContain("Before edit");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("treats different files as different cache entries", async () => {
    const cache = freshCache();
    const [a, b] = await Promise.all([cache.load(SCOPE_MDX), cache.load(INSTALL_MDX)]);

    expect(a.Component).not.toBe(b.Component);
    expect(a.meta["title"]).toBe("Context & Scope");
    expect(b.meta["title"]).toBe("Installation");
  });

  it("recompiles after invalidate()", async () => {
    const cache = freshCache();
    await cache.load(SCOPE_MDX);

    cache.invalidate(SCOPE_MDX);
    const second = await cache.load(SCOPE_MDX);

    expect(typeof second.Component).toBe("function");
    expect(second.meta["title"]).toBe("Context & Scope");
  });

  it("recompiles after clear()", async () => {
    const cache = freshCache();
    await cache.load(SCOPE_MDX);

    cache.clear();
    const result = await cache.load(SCOPE_MDX);

    expect(typeof result.Component).toBe("function");
    expect(result.meta["title"]).toBe("Context & Scope");
  });

  it("loads MDX with minimal frontmatter", async () => {
    const cache = freshCache();
    const { meta } = await cache.load(INSTALL_MDX);

    expect(meta["title"]).toBe("Installation");
  });

  it("throws on non-existent file", async () => {
    const cache = freshCache();
    const bogus = path.join(PAGES_DIR, "does-not-exist.mdx");

    expect(cache.load(bogus)).rejects.toThrow();
  });
});

it("renders static Markdown without importing a module, preserving component overrides", async () => {
  const sourceRoot = path.join(PAGES_DIR, ".compiled");
  await mkdir(sourceRoot, { recursive: true });
  const directory = await mkdtemp(path.join(sourceRoot, "mdx-static-test-"));
  const file = path.join(directory, "page.mdx");
  try {
    await writeFile(file, "---\ntitle: Static page\n---\n# Static heading\n\nA paragraph.\n");
    const { Component } = await freshCache().load(file);
    expect(await renderToString(Component({}))).toContain(
      '<h1 id="static-heading">Static heading</h1>',
    );
    const moduleDir = path.join(COMPILED_DIR, path.relative(PAGES_DIR, directory));
    const files = await readdir(moduleDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    expect(files).toEqual([]);
    expect(
      await renderToString(Component({ components: { RawHtml: () => raw("override") } })),
    ).toBe("override");
    expect((await readdir(moduleDir)).length).toBe(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("keeps highlighted code and Markdown URLs static, but loads executable MDX", async () => {
  const root = path.join(PAGES_DIR, ".compiled");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "mdx-runtime-test-"));
  const moduleDir = path.join(COMPILED_DIR, path.relative(PAGES_DIR, directory));
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
    const { Component } = await freshCache().load(file);
    const html = await renderToString(Component({}));
    expect(html).toContain(
      codeHighlighter === "expressive-code" ? 'class="expressive-code"' : 'class="docs-code-block"',
    );
    expect(html).toContain("<button");
    if (codeHighlighter === "highlight.js") expect(html).toContain('class="hljs-keyword"');
    expect(html).toContain('href="#blocked"');
    expect(html).toContain('src="#blocked"');
    expect(html).not.toContain('href="javascript:');
    expect(
      await readdir(moduleDir).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      }),
    ).toEqual([]);
    await writeFile(
      file,
      '---\ntitle: Runtime page\n---\nimport { raw } from "@vincle/core"\n\n{raw("<p>Executed</p>")}\n',
    );
    const runtime = await freshCache().load(file);
    expect(await renderToString(runtime.Component({}))).toContain("<p>Executed</p>");
    expect((await readdir(moduleDir)).length).toBe(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
