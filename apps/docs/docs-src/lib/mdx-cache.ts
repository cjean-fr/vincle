import type { MdxCompileOptions } from "satteri";

import grayMatter from "gray-matter";
import { readdirSync, rmSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mdxToJs, defineHastPlugin } from "satteri";
import expressiveCode from "satteri-expressive-code";

import { EC_THEMES, getSharedRenderer } from "./expressive-code.js";
import { wrapTables } from "./hast-plugins.js";

/** Where compiled MDX lands before being imported. */
const COMPILED_ROOT = path.resolve(import.meta.dirname, "../pages/.compiled");

/**
 * One directory per run, named by pid.
 *
 * `turbo run test build` runs `@vincle/docs:test` and `@vincle/docs:build` side
 * by side — neither depends on the other — and each calls `rebuildAll()`, which
 * `rm -rf`s its own directory. A shared one has each wipe what the other just
 * wrote, between the `writeFile` and the `import`.
 *
 * It stays inside the project tree: the compiled module imports `@vincle/core`,
 * so resolution still has to find `node_modules`.
 */
export const COMPILED_DIR = path.join(COMPILED_ROOT, String(process.pid));

/** `kill(pid, 0)` kills nothing — it asks whether the process is still there. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists, it is simply not ours.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Drop the directories left behind by runs that are over.
 *
 * The `exit` handler below covers a clean shutdown and nothing else: a process
 * ended by a signal — Ctrl+C on the dev server — never runs it, and a pid does
 * not come back (`pid_max` is in the millions), so each of those runs leaks its
 * directory for good. Sweeping on the way in is what makes the cleanup total,
 * `kill -9` included, which no handler can reach.
 *
 * Only dead pids, never this one: `turbo run test build` has two of these
 * processes writing side by side, and a live pid is another run's directory.
 */
function sweepFinishedRuns(): void {
  let entries;
  try {
    entries = readdirSync(COMPILED_ROOT, { withFileTypes: true });
  } catch {
    return; // Nothing compiled yet.
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pid = Number(entry.name);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    if (isRunning(pid)) continue;
    rmSync(path.join(COMPILED_ROOT, entry.name), { recursive: true, force: true });
  }
}

sweepFinishedRuns();

process.once("exit", () => {
  rmSync(COMPILED_DIR, { recursive: true, force: true });
});

export interface CompiledMdx {
  Component: (props: object) => import("@vincle/core").JSX.Element;
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
  providerImportSource: pathToFileURL(path.resolve(import.meta.dirname, "../mdx-components.jsx"))
    .href,
  hastPlugins: [
    // `customCreateRenderer` hands the plugin the shared renderer with its
    // page-independent assets blanked: those ship in the client bundle now
    // (see `expressive-code.ts`), so the plugin emits markup only.
    expressiveCode({ themes: EC_THEMES, customCreateRenderer: getSharedRenderer }),
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

  async #compileAndLoad(file: string, raw: string, key: string): Promise<CompiledMdx> {
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
      throw new Error(`[@vincle/docs] Compiled MDX ${file} has no default export.`);
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
    default: (props: object) => import("@vincle/core").JSX.Element;
  }> {
    const rel = path.relative(path.resolve(import.meta.dirname, "../pages"), file);
    const tmpFile = path.join(COMPILED_DIR, rel.replace(/\.mdx$/, ".tsx"));
    // `recursive` is idempotent; checking first would just open a race window.
    await mkdir(path.dirname(tmpFile), { recursive: true });
    await writeFile(tmpFile, code, "utf-8");
    return import(pathToFileURL(tmpFile).href);
  }

  async #hash(content: string): Promise<string> {
    const data = new TextEncoder().encode(content);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
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
