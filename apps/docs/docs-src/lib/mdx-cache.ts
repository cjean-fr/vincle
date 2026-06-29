import grayMatter from "gray-matter";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mdxToJs, defineHastPlugin } from "satteri";
import type { MdxCompileOptions } from "satteri";
import expressiveCode from "satteri-expressive-code";
import { wrapTables } from "./hast-plugins.js";

export interface CompiledMdx {
  Component: (props: object) => import("@vincle/core").VincleNode;
  meta: Record<string, unknown>;
}

const headingIds = defineHastPlugin({
  name: "heading-ids",
  element: {
    filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
    visit(node, ctx) {
      const id = ctx
        .textContent(node)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (id) ctx.setProperty(node, "id", id);
    },
  },
});

const compileOptions: MdxCompileOptions = {
  jsxImportSource: "@vincle/core",
  providerImportSource: pathToFileURL(
    path.resolve(import.meta.dirname, "../mdx-components.jsx"),
  ).href,
  hastPlugins: [
    expressiveCode({ themes: ["github-light", "github-dark"] }),
    headingIds,
    wrapTables,
  ],
};

export class MdxCache {
  static readonly MAX_SIZE = 1000;
  #compiled = new Map<string, string>();
  #modules = new Map<string, CompiledMdx>();
  #pending = new Map<string, Promise<CompiledMdx>>();

  async load(file: string): Promise<CompiledMdx> {
    const raw = await readFile(file, "utf-8");
    const hash = await this.#hash(raw);
    const key = `${file}:${hash}`;

    const existing = this.#modules.get(key);
    if (existing) return existing;

    const prev = this.#pending.get(key);
    if (prev) return prev;

    const promise = this.#compileAndLoad(file, raw, key);
    this.#pending.set(key, promise);
    try {
      return await promise;
    } finally {
      this.#pending.delete(key);
    }
  }

  async #compileAndLoad(
    file: string,
    raw: string,
    key: string,
  ): Promise<CompiledMdx> {
    const { data: frontmatter, content } = grayMatter(raw);
    const { code } = await mdxToJs(content, compileOptions);

    if (this.#modules.size >= MdxCache.MAX_SIZE) {
      const first = this.#modules.keys().next();
      if (!first.done) {
        this.#modules.delete(first.value);
        this.#compiled.delete(first.value);
      }
    }
    this.#compiled.set(key, code);

    const mod = await this.#importModule(file, code);
    const Component = mod.default;
    if (typeof Component !== "function") {
      throw new Error(
        `[@vincle/docs] Compiled MDX ${file} has no default export.`,
      );
    }

    const entry: CompiledMdx = {
      Component,
      meta: frontmatter as Record<string, unknown>,
    };
    this.#modules.set(key, entry);
    return entry;
  }

  async #importModule(
    file: string,
    code: string,
  ): Promise<{
    default: (props: object) => import("@vincle/core").VincleNode;
  }> {
    const pagesDir = path.resolve(import.meta.dirname, "../pages");
    const rel = path.relative(pagesDir, file);
    const tmpFile = path.join(
      pagesDir,
      ".compiled",
      rel.replace(/\.mdx$/, ".tsx"),
    );
    const tmpDir = path.dirname(tmpFile);
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true });
    }
    await writeFile(tmpFile, code, "utf-8");
    return import(pathToFileURL(tmpFile).href);
  }

  async #hash(content: string): Promise<string> {
    const data = new TextEncoder().encode(content);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    return hex.slice(0, 16);
  }

  invalidate(file: string): void {
    const prefix = file + ":";
    for (const key of this.#compiled.keys()) {
      if (key.startsWith(prefix)) {
        this.#compiled.delete(key);
        this.#modules.delete(key);
      }
    }
  }

  clear(): void {
    this.#compiled.clear();
    this.#modules.clear();
    this.#pending.clear();
  }
}

export const mdxCache = new MdxCache();
