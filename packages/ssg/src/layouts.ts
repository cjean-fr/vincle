import { stat } from "node:fs/promises";
import path from "node:path";

import type { PageContext, ModuleLoader } from "./types.js";

import { failure } from "./errors.js";

type Layout = (props: PageContext & { children: unknown }) => unknown;

/** The nearest layout replaces its ancestor; page metadata can override it. */
export function layoutLoader() {
  const loaded = new Map<string, Promise<Layout>>();
  async function load(file: string, importSource: string, modules: ModuleLoader): Promise<Layout> {
    let pending = loaded.get(file);
    if (!pending) {
      pending = modules.load(file, importSource).then((mod) => {
        if (typeof mod["default"] !== "function")
          throw failure(`Layout needs a default component: ${file}`, {
            reason: "LAYOUT_FAILED",
            hint: "Export a default layout function accepting { children, meta } from this layout file.",
            context: { file },
          });
        return mod["default"] as Layout;
      });
      loaded.set(file, pending);
    }
    return pending;
  }
  return async (context: PageContext): Promise<Layout | undefined> => {
    if (context.meta.layout === false) return undefined;
    if (typeof context.meta.layout === "string") {
      context.watch(path.resolve(path.dirname(context.file), context.meta.layout));
      return load(
        path.resolve(path.dirname(context.file), context.meta.layout),
        context.runtime.importSource,
        context.modules,
      );
    }
    for (let directory = path.dirname(context.file); ; directory = path.dirname(directory)) {
      for (const extension of ["tsx", "jsx", "ts", "js"]) {
        const file = path.join(directory, `_layout.${extension}`);
        context.watch(file);
        try {
          if ((await stat(file)).isFile())
            return load(file, context.runtime.importSource, context.modules);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      if (directory === context.src) return undefined;
    }
  };
}
