import { raw as rawHtml } from "@vincle/core";
import { jsxAttr } from "@vincle/core/jsx-precompile-runtime";
import grayMatter from "gray-matter";
import { readFile } from "node:fs/promises";
import {
  mdxToJs,
  mdxToMdast,
  markdownToHtml,
  markdownToJs,
  defineHastPlugin,
  type MdxCompileOptions,
} from "satteri";

import type { ModuleLoader, PageContext, PageHandler, SsgMeta } from "./types.js";

import { failure } from "./errors.js";
import { metadata, moduleMeta } from "./metadata.js";
import { markdownOutputs, withAdditionalOutputs } from "./results.js";

export type MdxComponent = (props: object) => import("@vincle/core").JSX.Element;
export interface CompiledMdx<T = undefined> {
  Component: MdxComponent;
  meta: SsgMeta;
  /** Present when MDX evaluates a module, including its named exports. */
  module?: Record<string, unknown>;
  data: T;
}

export interface MdxPreparation<T> {
  data: T;
  /** A fresh plugin set for each compilation, including deferred component overrides. */
  createPlugins?: () => NonNullable<MdxCompileOptions["hastPlugins"]>;
}

export interface MdxOptions<T = undefined> {
  compile?: MdxCompileOptions;
  prepare?: (source: { file: string; meta: SsgMeta }) => MdxPreparation<T>;
}

// Direct HTML must preserve Core's URL policy for Markdown links and images.
const markdownUrls = defineHastPlugin({
  name: "vincle-markdown-urls",
  element: {
    filter: ["a", "img"],
    visit(node, ctx) {
      const name = node.tagName === "a" ? "href" : "src";
      const value = node.properties[name];
      if (value !== undefined && String(jsxAttr(name, value)) === `${name}="#blocked"`) {
        ctx.setProperty(node, name, "#blocked");
      }
    },
  },
});

function requiresMdxRuntime(node: {
  type: string;
  children?: readonly { type: string }[];
}): boolean {
  if (node.type.startsWith("mdx")) return true;
  return node.children?.some(requiresMdxRuntime) ?? false;
}

export class MdxCache<T = undefined> {
  private readonly options: MdxOptions<T>;
  constructor(options: MdxOptions<T> = {}) {
    this.options = options;
  }
  static readonly MAX_SIZE = 1000;
  #modules = new Map<string, CompiledMdx<T>>();
  #pending = new Map<string, Promise<CompiledMdx<T>>>();
  #loaderIds = new WeakMap<ModuleLoader, number>();
  #nextLoader = 0;

  async load(
    file: string,
    modules: ModuleLoader,
    importSource = "@vincle/core",
  ): Promise<CompiledMdx<T>> {
    const raw = await readFile(file, "utf-8");
    const hash = await this.#hash(raw);
    const loaderId = this.#loaderIds.get(modules) ?? ++this.#nextLoader;
    this.#loaderIds.set(modules, loaderId);
    const key = `${file}:${hash}:${loaderId}:${importSource}`;

    const existing = this.#modules.get(key);
    if (existing) return existing;

    const prev = this.#pending.get(key);
    if (prev) return prev;

    const promise = this.#compileAndLoad(file, raw, key, modules, importSource);
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
    modules: ModuleLoader,
    importSource: string,
  ): Promise<CompiledMdx<T>> {
    const { data: frontmatter, content } = grayMatter(raw, {});
    const meta = metadata(frontmatter, file);
    const preparation = this.options.prepare?.({ file, meta });
    const compileOptions: MdxCompileOptions = {
      ...this.options.compile,
      jsxImportSource: importSource,
    };
    const createPlugins = () => preparation?.createPlugins?.() ?? compileOptions.hastPlugins ?? [];
    const markdown = file.endsWith(".md");
    const compile = markdown ? markdownToJs : mdxToJs;
    const needsRuntime = !markdown && requiresMdxRuntime(mdxToMdast(content, { position: false }));
    const optimization = compileOptions.optimizeStatic;
    const rawHtmlProvider =
      typeof optimization === "object" &&
      optimization.component === "RawHtml" &&
      optimization.prop === "html";
    const directHtml =
      !needsRuntime &&
      importSource === "@vincle/core" &&
      (!compileOptions.providerImportSource || rawHtmlProvider);
    const html = directHtml
      ? (
          await markdownToHtml(content, { hastPlugins: [...createPlugins(), markdownUrls] })
        ).html.trimEnd()
      : null;
    const importModule = async () =>
      this.#importModule(
        file,
        (await compile(content, { ...compileOptions, hastPlugins: createPlugins() })).code,
        modules,
        importSource,
      );

    if (this.#modules.size >= MdxCache.MAX_SIZE) {
      const first = this.#modules.keys().next();
      if (!first.done) {
        this.#modules.delete(first.value);
      }
    }

    let Component: MdxComponent;
    let loaded: Record<string, unknown> | undefined;
    if (html !== null) {
      // Component overrides opt into MDX semantics; otherwise use static HTML.
      let module: Promise<Record<string, unknown>> | undefined;
      Component = (props) => {
        if (!("components" in props)) return rawHtml(html);
        module ??= importModule();
        return module.then((mod) => (mod["default"] as MdxComponent)(props));
      };
    } else {
      loaded = await importModule();
      Component = loaded["default"] as MdxComponent;
    }

    const entry: CompiledMdx<T> = {
      Component,
      meta: loaded ? moduleMeta(loaded, file, meta) : meta,
      module: loaded,
      data: preparation?.data as T,
    };
    this.#modules.set(key, entry);
    return entry;
  }

  async #importModule(
    file: string,
    code: string,
    modules: ModuleLoader,
    importSource: string,
  ): Promise<Record<string, unknown>> {
    const mod = await modules.load(file, importSource, code);
    if (typeof mod["default"] !== "function")
      throw failure(`Compiled MDX ${file} has no default component.`, {
        reason: "SOURCE_FAILED",
        hint: "Check the MDX compiler output and default export.",
        context: { file },
      });
    return mod;
  }

  async #hash(content: string): Promise<string> {
    const data = new TextEncoder().encode(content);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 16);
  }

  invalidate(file: string): void {
    const prefix = file + ":";
    for (const key of this.#modules.keys()) {
      if (key.startsWith(prefix)) {
        this.#modules.delete(key);
      }
    }
  }

  clear(): void {
    this.#modules.clear();
    this.#pending.clear();
  }
}

/** Read metadata during discovery; compile only when an HTML output is requested. */
export function createMdxHandler<T = undefined>(
  options: MdxOptions<T> & {
    beforeRender?: (compiled: CompiledMdx<T>, context: PageContext) => void | Promise<void>;
  } = {},
): PageHandler {
  const cache = new MdxCache(options);
  return {
    name: "mdx",
    incremental: true,
    async load(source) {
      const text = await readFile(source.file, "utf8");
      const { data, content } = grayMatter(text, {});
      cache.invalidate(source.file);
      const tree =
        !source.file.endsWith(".md") && /\bexport\b/.test(content)
          ? mdxToMdast(content, { position: false })
          : undefined;
      const hasExports =
        tree &&
        "children" in tree &&
        tree.children.some((node) => node.type === "mdxjsEsm" && /\bexport\b/.test(node.value));
      const exported = hasExports
        ? await cache.load(source.file, source.modules, source.runtime.importSource)
        : undefined;
      return {
        meta: exported?.meta ?? metadata(data, source.file),
        render: withAdditionalOutputs(exported?.module ?? {}, async (context) => {
          const compiled = await cache.load(
            source.file,
            context.modules,
            context.runtime.importSource,
          );
          return markdownOutputs(context, text, () => {
            const ready = options.beforeRender?.(compiled, context);
            return ready
              ? ready.then(() => compiled.Component(context))
              : compiled.Component(context);
          });
        }),
      };
    },
  };
}
