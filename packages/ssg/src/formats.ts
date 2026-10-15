import { renderToString, Scope, type Renderable } from "@vincle/core";
import path from "node:path";

import type { DiscoverPagesOptions, JsxRuntime, PageHandler, SiteContent } from "./types.js";

import { failure } from "./errors.js";
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
    incremental: true,
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

/** Override or add an extension in build({ handlers }). */
export const defaultHandlers: Readonly<Record<string, PageHandler>> = {
  ".js": moduleHandler,
  ".ts": moduleHandler,
  ".jsx": jsxHandler,
  ".tsx": jsxHandler,
  ".md": markdownHandler,
  ".mdx": markdownHandler,
};

export function resolveHandlers(overrides: DiscoverPagesOptions["handlers"]) {
  const handlers = { ...defaultHandlers, ...overrides };
  for (const extension of Object.keys(handlers))
    if (!/^\.[^.\\/]+$/.test(extension))
      throw failure(`Invalid handler extension: ${extension}`, {
        reason: "INVALID_HANDLER",
        hint: "Use one dotted extension such as .mdx or .pt as each handler key; false disables a format.",
        context: { extension },
      });
  return handlers;
}
