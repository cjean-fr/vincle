import { renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { MdxCache } from "./mdx-cache.js";

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
