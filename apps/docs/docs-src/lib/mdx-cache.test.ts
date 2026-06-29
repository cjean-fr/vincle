import { MdxCache } from "./mdx-cache.js";
import { describe, it, expect } from "bun:test";
import path from "node:path";

const PAGES_DIR = path.resolve(import.meta.dirname, "../pages");
const CONTEXT_MDX = path.join(PAGES_DIR, "api/core/context.mdx");
const INSTALL_MDX = path.join(
  PAGES_DIR,
  "guide/getting-started/installation.mdx",
);

function freshCache(): MdxCache {
  return new MdxCache();
}

describe("MdxCache", () => {
  it("loads a real MDX file and returns Component + meta", async () => {
    const cache = freshCache();
    const { Component, meta } = await cache.load(CONTEXT_MDX);

    expect(typeof Component).toBe("function");
    expect(meta["title"]).toBe("Context API");
  });

  it("returns the same Component reference on cache hit", async () => {
    const cache = freshCache();
    const first = await cache.load(CONTEXT_MDX);
    const second = await cache.load(CONTEXT_MDX);

    expect(first.Component).toBe(second.Component);
    expect(first.meta).toBe(second.meta);
  });

  it("treats different files as different cache entries", async () => {
    const cache = freshCache();
    const [a, b] = await Promise.all([
      cache.load(CONTEXT_MDX),
      cache.load(INSTALL_MDX),
    ]);

    expect(a.Component).not.toBe(b.Component);
    expect(a.meta["title"]).toBe("Context API");
    expect(b.meta["title"]).toBe("Installation");
  });

  it("recompiles after invalidate()", async () => {
    const cache = freshCache();
    await cache.load(CONTEXT_MDX);

    cache.invalidate(CONTEXT_MDX);
    const second = await cache.load(CONTEXT_MDX);

    expect(typeof second.Component).toBe("function");
    expect(second.meta["title"]).toBe("Context API");
  });

  it("recompiles after clear()", async () => {
    const cache = freshCache();
    await cache.load(CONTEXT_MDX);

    cache.clear();
    const result = await cache.load(CONTEXT_MDX);

    expect(typeof result.Component).toBe("function");
    expect(result.meta["title"]).toBe("Context API");
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
