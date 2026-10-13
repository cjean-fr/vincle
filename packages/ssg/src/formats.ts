import { compile } from "@mdx-js/mdx";
import { renderToString, Scope, type Renderable } from "@vincle/core";
import matter from "gray-matter";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  JsxRuntime,
  PageHandler,
  SsgMeta,
  SsgPage,
  SsgProducer,
  SiteContent,
} from "./types.js";

import { failure, diagnose } from "./errors.js";
import { withAdditionalOutputs } from "./results.js";

export const vincleRuntime: JsxRuntime = {
  importSource: "@vincle/core",
  render: (create) => Scope.with(() => renderToString(create() as Renderable)),
};

export function metadata(value: unknown, file: string): SsgMeta {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw failure(`Metadata must be an object: ${file}`, {
      reason: "INVALID_METADATA",
      hint: "Use a metadata object in export const meta or YAML frontmatter; arrays and null are not valid.",
      context: { file },
    });
  }
  const meta = { ...value } as SsgMeta;
  if (meta.sitemap !== undefined && typeof meta.sitemap !== "boolean") {
    throw failure(`Metadata sitemap must be a boolean: ${file}`, {
      reason: "INVALID_METADATA",
      hint: "Set meta.sitemap to true or false, not a quoted string or another value.",
      context: { file, field: "sitemap" },
    });
  }
  if (
    meta.layout !== undefined &&
    meta.layout !== false &&
    (typeof meta.layout !== "string" || !meta.layout)
  ) {
    throw failure(`Metadata layout must be a file path or false: ${file}`, {
      reason: "INVALID_METADATA",
      hint: "Set meta.layout to a non-empty layout file path relative to the page, or false to disable layouts.",
      context: { file, field: "layout" },
    });
  }
  return meta;
}

function moduleMeta(mod: Record<string, unknown>, file: string, initial: SsgMeta = {}): SsgMeta {
  return metadata(
    {
      ...initial,
      ...metadata(mod["meta"], file),
      ...(mod["sitemap"] === undefined ? {} : { sitemap: mod["sitemap"] }),
    },
    file,
  );
}

function isContent(value: unknown): value is SiteContent {
  return typeof value === "string" || value instanceof Uint8Array || value instanceof ArrayBuffer;
}

const moduleHandler: PageHandler = {
  name: "module",
  async load(source) {
    const mod = await source.modules.load(source.file, source.runtime.importSource);
    const producer = mod["default"];
    if (producer === undefined)
      throw failure(`No default export: ${source.file}`, {
        reason: "SOURCE_FAILED",
        hint: "Add a default component for JSX/TSX, or a default content/output producer for JS/TS.",
        context: { file: source.file },
      });
    return {
      meta: moduleMeta(mod, source.file),
      render: withAdditionalOutputs(mod, async (context) => {
        const result = typeof producer === "function" ? await producer(context) : producer;
        if (isContent(result)) {
          // data.json.ts and robots.txt.js preserve their explicit output suffix.
          const extension = path.posix.extname(context.route);
          const outputPath = extension ? context.route.slice(1) : context.outputPath();
          return { path: outputPath, content: result };
        }
        return result;
      }),
    };
  },
};

const jsxHandler: PageHandler = {
  name: "jsx",
  async load(source) {
    const mod = await source.modules.load(source.file, source.runtime.importSource);
    const Component = mod["default"];
    if (Component === undefined)
      throw failure(`No default export: ${source.file}`, {
        reason: "SOURCE_FAILED",
        hint: "Add a default component for JSX/TSX, or a default content/output producer for JS/TS.",
        context: { file: source.file },
      });
    return {
      meta: moduleMeta(mod, source.file),
      render: withAdditionalOutputs(mod, (context) => ({
        path: context.outputPath(),
        content: () =>
          context.runtime.render(() =>
            typeof Component === "function" ? Component(context) : Component,
          ),
      })),
    };
  },
};

const markdownHandler: PageHandler = {
  name: "markdown",
  async load(source): Promise<SsgPage> {
    const text = await readFile(source.file, "utf8");
    const { data, content } = matter(text);
    const code = await compile(content, {
      format: source.file.endsWith(".mdx") ? "mdx" : "md",
      jsxImportSource: source.runtime.importSource,
      development: false,
    });
    const mod = await source.modules.load(source.file, source.runtime.importSource, String(code));
    const Component = mod["default"];
    if (typeof Component !== "function")
      throw failure(`No Markdown component: ${source.file}`, {
        reason: "SOURCE_FAILED",
        hint: "Check Markdown/MDX syntax and exports. The compiled document must provide a default component.",
        context: { file: source.file },
      });
    return {
      meta: moduleMeta(mod, source.file, metadata(data, source.file)),
      render: withAdditionalOutputs(mod, (context) => [
        {
          path: context.outputPath(),
          content: () => context.runtime.render(() => Component(context)),
        },
        { path: context.outputPath(".md"), content: text, sitemap: false },
      ]),
    };
  },
};

function checked(handler: PageHandler): PageHandler {
  return {
    ...handler,
    load: (source) =>
      diagnose(async () => handler.load(source), "Could not load source", {
        reason: "SOURCE_FAILED",
        hint: "Check this file's syntax, metadata and imports. Inspect the cause for the original parser or filesystem error.",
        context: { file: source.file, handler: handler.name, phase: "load" },
      }),
  };
}

/** Override or add an extension in build({ handlers }). */
export const defaultHandlers: Readonly<Record<string, PageHandler>> = {
  ".js": checked(moduleHandler),
  ".ts": checked(moduleHandler),
  ".jsx": checked(jsxHandler),
  ".tsx": checked(jsxHandler),
  ".md": checked(markdownHandler),
  ".mdx": checked(markdownHandler),
};

// Publicly typed producer contracts are intentionally independent of JSX values.
export type { SsgProducer };
