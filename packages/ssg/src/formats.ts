import { renderToString, Scope, type Renderable } from "@vincle/core";
import path from "node:path";

import type { JsxRuntime, PageHandler, SsgProducer, SiteContent } from "./types.js";

import { failure, diagnose } from "./errors.js";
import { createMdxHandler } from "./mdx.js";
import { moduleMeta } from "./metadata.js";
import { withAdditionalOutputs } from "./results.js";

export const vincleRuntime: JsxRuntime = {
  importSource: "@vincle/core",
  render: (create) => Scope.with(() => renderToString(create() as Renderable)),
};

function isContent(value: unknown): value is SiteContent {
  return typeof value === "string" || value instanceof Uint8Array || value instanceof ArrayBuffer;
}

function scriptHandler(name: "module" | "jsx"): PageHandler {
  return {
    name,
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
          const create = () => (typeof producer === "function" ? producer(context) : producer);
          if (name === "jsx")
            return {
              path: context.outputPath(),
              content: () => context.runtime.render(create),
            };
          const result = await create();
          if (isContent(result)) {
            // data.json.ts and robots.txt.js preserve their explicit output suffix.
            const extension = path.posix.extname(context.route);
            return {
              path: extension ? context.route.slice(1) : context.outputPath(),
              content: result,
            };
          }
          return result;
        }),
      };
    },
  };
}

const moduleHandler = scriptHandler("module");
const jsxHandler = scriptHandler("jsx");
const markdownHandler = createMdxHandler();

function checked(handler: PageHandler): PageHandler {
  return {
    ...handler,
    incremental: true,
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
