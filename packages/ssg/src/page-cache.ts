import path from "node:path";

import type {
  DiscoveredPage,
  PageContext,
  PageHandler,
  RenderedOutput,
  SourceContext,
  SsgOptions,
  SsgPage,
} from "./types.js";

interface Entry {
  page: SsgPage;
  source: SourceContext;
  handler: PageHandler;
  direct: Set<string>;
  roots: Set<string>;
  dependencies: Set<string>;
  context?: PageContext;
  outputs?: RenderedOutput[];
}

/** Avoid retaining a cache transaction through dependency-collector closures. */
function trackedSource(source: SourceContext) {
  const originalWatch = source.watch;
  const originalModules = source.modules;
  const direct = new Set<string>();
  const roots = new Set<string>();
  const watch = (file: string) => {
    const absolute = path.resolve(path.dirname(source.file), file);
    direct.add(absolute);
    originalWatch(absolute);
  };
  watch(source.file);
  const context: SourceContext = {
    ...source,
    watch,
    modules: {
      watchFile: watch,
      load(file, runtime, code) {
        const absolute = path.resolve(path.dirname(source.file), file);
        roots.add(absolute);
        watch(absolute);
        return originalModules.load(absolute, runtime, code);
      },
    },
  };
  return { context, direct, roots, watch };
}

/** Dev-only, committed only after the entire publication succeeds. */
export class PageCache {
  private entries = new Map<string, Entry>();
  private dirty = new Set<string>();
  private forced = false;
  private dependencies: (file: string) => Set<string>;
  constructor(dependencies: (file: string) => Set<string>) {
    this.dependencies = dependencies;
  }
  invalidate(files: Iterable<string>) {
    for (const file of files) this.dirty.add(file);
  }
  force() {
    this.forced = true;
  }
  clear() {
    this.entries.clear();
    this.dirty.clear();
  }
  begin(options: SsgOptions) {
    const staged = new Map<string, Entry>();
    const hooksSafe = (options.plugins ?? []).every(
      (plugin) =>
        !(plugin.metadata || plugin.render || plugin.transform) || plugin.incremental === true,
    );
    const forced = this.forced;
    const changed = new Set(this.dirty);
    const dirty = (entry: Entry) =>
      forced || !hooksSafe || [...entry.dependencies].some((file) => changed.has(file));
    return {
      wrap: (handler: PageHandler): PageHandler => ({
        ...handler,
        load: async (source) => {
          const old = this.entries.get(source.file);
          if (
            handler.incremental === true &&
            old?.handler === handler &&
            old.page.meta?.incremental !== false &&
            old.context?.meta.incremental !== false &&
            !dirty(old)
          ) {
            source.watch = old.source.watch;
            source.modules = old.source.modules;
            staged.set(source.file, { ...old });
            return old.page;
          }
          const { context, direct, roots, watch } = trackedSource(source);
          const page = await handler.load(context);
          // renderPage creates its context from discovery's source. Keep the
          // dependency collector alive for layouts, producers and plugin hooks.
          source.watch = watch;
          source.modules = context.modules;
          staged.set(source.file, {
            page,
            source,
            handler,
            direct,
            roots,
            dependencies: new Set(direct),
          });
          return page;
        },
      }),
      rendered(page: DiscoveredPage) {
        const entry = staged.get(page.source.file);
        return entry?.outputs &&
          entry.context &&
          page.meta.incremental !== false &&
          entry.context.route === page.source.route &&
          entry.context.meta.renderKey === page.meta.renderKey
          ? entry
          : undefined;
      },
      store: (file: string, context: PageContext, outputs: RenderedOutput[]) => {
        const entry = staged.get(file);
        if (!entry) return;
        entry.context = context;
        entry.outputs = outputs.map((output) => ({
          ...output,
          content:
            output.content instanceof Uint8Array
              ? new Uint8Array(output.content)
              : output.content instanceof ArrayBuffer
                ? output.content.slice(0)
                : output.content,
        }));
        entry.dependencies = new Set(entry.direct);
        for (const root of entry.roots)
          for (const dependency of this.dependencies(root)) entry.dependencies.add(dependency);
      },
      commit: () => {
        this.entries = staged;
        for (const file of changed) this.dirty.delete(file);
        this.forced = false;
        const watched = new Set<string>();
        for (const entry of this.entries.values())
          for (const file of entry.dependencies) watched.add(file);
        return watched;
      },
    };
  }
}
export type PageCacheSession = ReturnType<PageCache["begin"]>;
