import { stat } from "node:fs/promises";
import path from "node:path";

import type {
  DiscoveredPage,
  JsxRuntime,
  PageContext,
  ModuleLoader,
  RenderedOutput,
  SsgPlugin,
} from "./types.js";

import { diagnose, failure, contextualError } from "./errors.js";
import { metadata } from "./metadata.js";
import { iterateOutputs } from "./results.js";

/** Cached runtimes retain their page, not a completed render generator's state. */
function scopedRuntime(
  context: PageContext,
  runtime: JsxRuntime,
  findLayout: ReturnType<typeof layoutLoader>,
): JsxRuntime {
  return {
    ...runtime,
    async render(create) {
      const layout = await findLayout(context);
      return runtime.render(
        layout ? async () => layout({ ...context, children: await create() }) : create,
      );
    },
  };
}

interface RenderOptions {
  plugins?: readonly SsgPlugin[];
  runtime?: JsxRuntime;
  onContext?: (context: PageContext) => void;
}

/** Internal build session: layout probes and imports are shared only by this build. */
export function createPageRenderer() {
  const findLayout = layoutLoader();
  return (page: DiscoveredPage, options: RenderOptions = {}) =>
    renderPageInternal(page, options, findLayout);
}

/** Shared lifecycle used by build() and consumers with specialized site shells. */
export function renderPage(page: DiscoveredPage, options: RenderOptions = {}) {
  return createPageRenderer()(page, options);
}

async function* renderPageInternal(
  page: DiscoveredPage,
  options: RenderOptions,
  findLayout: ReturnType<typeof layoutLoader>,
): AsyncGenerator<RenderedOutput> {
  try {
    const context: PageContext = { ...page.source, meta: page.meta };
    const plugins = options.plugins ?? [];
    const runHook = <T>(plugin: SsgPlugin, hook: string, run: () => Promise<T>) =>
      diagnose(run, `Plugin ${hook} phase failed`, {
        reason: "PLUGIN_FAILED",
        hint: `Fix the named plugin's ${hook} hook or configuration. Inspect cause for the original failure.`,
        context: { file: context.file, plugin: plugin.name, hook },
      });
    for (const plugin of plugins)
      await runHook(plugin, "metadata", async () => plugin.metadata?.(context));
    metadata(context.meta, context.file);
    options.onContext?.(context);
    const runtime = options.runtime ?? context.runtime;
    context.runtime = scopedRuntime(context, runtime, findLayout);
    for await (let output of iterateOutputs(await page.render(context))) {
      for (const plugin of plugins)
        output =
          (await runHook(plugin, "render", async () => plugin.render?.(output, context))) ?? output;
      if (!output || typeof output.path !== "string")
        throw failure("An output requires a relative path.", {
          reason: "INVALID_OUTPUT",
          hint: "Return { path, content } with a string path relative to out.",
          context: { file: context.file },
        });
      let rendered: RenderedOutput = {
        ...output,
        content: typeof output.content === "function" ? await output.content() : output.content,
      };
      for (const plugin of plugins)
        rendered =
          (await runHook(plugin, "transform", async () => plugin.transform?.(rendered, context))) ??
          rendered;
      yield finalizeOutput(rendered, context);
    }
  } catch (error) {
    throw contextualError(error, "Page rendering failed", {
      reason: "SOURCE_FAILED",
      hint: "Check this page's producer, selected layout and plugins. Inspect cause for the original failure.",
      context: { file: page.source.file, phase: "render" },
    });
  }
}

/** Validate transformed content and resolve metadata and sitemap defaults once. */
function finalizeOutput(rendered: RenderedOutput, context: PageContext): RenderedOutput {
  if (
    typeof rendered.content !== "string" &&
    !(rendered.content instanceof Uint8Array) &&
    !(rendered.content instanceof ArrayBuffer)
  )
    throw failure("A transform must return materialized content.", {
      reason: "INVALID_OUTPUT",
      hint: "Return a string, Uint8Array or ArrayBuffer as content, not a deferred producer.",
      context: { file: context.file, path: rendered.path },
    });
  return {
    ...rendered,
    meta: metadata({ ...context.meta, ...rendered.meta }, context.file),
    sitemap:
      rendered.sitemap ??
      (rendered.path.endsWith(".html") &&
        (rendered.meta?.sitemap ?? context.meta.sitemap) !== false),
  };
}

type Layout = (props: PageContext & { children: unknown }) => unknown;

/** The nearest layout replaces its ancestor; page metadata can override it. */
function layoutLoader() {
  const files = new Map<string, Promise<boolean>>();
  const loaded = new WeakMap<ModuleLoader, Map<string, Promise<Layout>>>();
  function exists(file: string) {
    let pending = files.get(file);
    if (!pending) {
      pending = stat(file).then(
        (info) => info.isFile(),
        (error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw error;
        },
      );
      files.set(file, pending);
    }
    return pending;
  }
  async function load(file: string, importSource: string, modules: ModuleLoader): Promise<Layout> {
    let cache = loaded.get(modules);
    if (!cache) loaded.set(modules, (cache = new Map()));
    const key = `${importSource}\0${file}`;
    let pending = cache.get(key);
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
      cache.set(key, pending);
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
    const boundary =
      path.basename(context.src) === "pages" && path.basename(path.dirname(context.src)) === "src"
        ? path.dirname(context.src)
        : context.src;
    for (let directory = path.dirname(context.file); ; directory = path.dirname(directory)) {
      for (const extension of ["tsx", "jsx", "ts", "js"]) {
        const file = path.join(directory, `_layout.${extension}`);
        context.watch(file);
        if (await exists(file)) return load(file, context.runtime.importSource, context.modules);
      }
      if (directory === boundary) return undefined;
    }
  };
}
