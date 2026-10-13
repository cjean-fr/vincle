import type {
  DiscoveredPage,
  JsxRuntime,
  PageContext,
  RenderedOutput,
  SsgPlugin,
} from "./types.js";

import { diagnose, failure, contextualError } from "./errors.js";
import { metadata } from "./formats.js";
import { layoutLoader } from "./layouts.js";
import { iterateOutputs } from "./results.js";

/** Shared lifecycle used by build() and consumers with specialized site shells. */
export async function* renderPage(
  page: DiscoveredPage,
  options: {
    plugins?: readonly SsgPlugin[];
    runtime?: JsxRuntime;
    onContext?: (context: PageContext) => void;
  } = {},
): AsyncGenerator<RenderedOutput> {
  try {
    yield* renderPageInternal(page, options);
  } catch (error) {
    throw contextualError(error, "Page rendering failed", {
      reason: "SOURCE_FAILED",
      hint: "Check this page's producer, selected layout and plugins. Inspect cause for the original failure.",
      context: { file: page.source.file, phase: "render" },
    });
  }
}

async function* renderPageInternal(
  page: DiscoveredPage,
  options: {
    plugins?: readonly SsgPlugin[];
    runtime?: JsxRuntime;
    onContext?: (context: PageContext) => void;
  },
): AsyncGenerator<RenderedOutput> {
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
  const findLayout = layoutLoader();
  context.runtime = {
    ...runtime,
    async render(create) {
      const layout = await findLayout(context);
      return runtime.render(
        layout ? async () => layout({ ...context, children: await create() }) : create,
      );
    },
  };
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
    yield {
      ...rendered,
      sitemap:
        rendered.sitemap ?? (rendered.path.endsWith(".html") && context.meta.sitemap !== false),
    };
  }
}
