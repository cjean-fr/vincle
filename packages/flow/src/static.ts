import { raw, renderToString, snapshot, withScope, type JSX } from "@vincle/core";

import type { Adapter } from "./adapters/index.js";

import { assertAdapter, PREFIX, describeValue } from "./config.js";
import { withFlow, initFlowAssets, suppressFlowAssets } from "./context.js";
import { flushTemplates } from "./flushTemplates.js";

const DEFAULT_GENERATE_PATH = (id: string) => `/fragments/${id}.html`;

/**
 * Static generation context for pure-static pages — no adapter, no fragment
 * emission. When `renderToStatic` is called without options, the handler
 * receives this type and cannot call `emitFragments`.
 */
export interface PureStaticContext {
  /** Render a page node, applying adapter.transformShell if present. */
  renderPage(node: () => JSX.Element): Promise<string>;
}

/**
 * Static generation context extended with fragment emission. When
 * `renderToStatic` is called with `{ adapter }`, the handler receives
 * this type and can call `emitFragments` after rendering all pages.
 */
export interface StaticContext extends PureStaticContext {
  /**
   * Materialize every pending template as a standalone file. Each is
   * wrapped with `adapter.Frame` and rendered, so `html` is ready to write as
   * is; `url` is the path from `generatePath(id)`.
   */
  emitFragments(cb: (id: string, url: string, html: string) => void | Promise<void>): Promise<void>;
}

export interface StaticOptions {
  /** Wire-format adapter for fragment framing. Required when using emitFragments. */
  adapter: Adapter;
  /** Fragment URL convention. Default: (id) => `/fragments/${id}.html`. */
  generatePath?: (id: string) => string;
}

/**
 * Static generation for pure-static sites (no lazy `<Template>` content).
 * Call without options — the handler receives a `PureStaticContext`
 * without `emitFragments`.
 */
export async function renderToStatic<T>(handler: (ctx: PureStaticContext) => T): Promise<T>;

/**
 * Static generation with deferred fragments.
 * Pass `{ adapter }` — the handler receives a `StaticContext` with
 * `emitFragments` to materialize fragment files.
 */
export async function renderToStatic<T>(
  handler: (ctx: StaticContext) => T,
  options: StaticOptions,
): Promise<T>;

export async function renderToStatic<T>(
  handler: (ctx: StaticContext) => T,
  options?: StaticOptions,
): Promise<T> {
  const adapter = options?.adapter;
  const generatePath = options?.generatePath ?? DEFAULT_GENERATE_PATH;

  // Fail fast on the options, before a single page renders.
  assertAdapter(adapter, "renderToStatic");
  if (options?.generatePath !== undefined && typeof options.generatePath !== "function") {
    throw new Error(
      `${PREFIX} renderToStatic: generatePath must be a function (id) => string, ` +
        `got ${describeValue(options.generatePath)}. Example: (id) => \`/fragments/\${id}.html\`.`,
    );
  }

  return withFlow(
    async (ctx) => {
      const staticCtx: StaticContext = {
        renderPage: (node) =>
          withScope(async () => {
            // A page boundary is an asset boundary: a fresh state before the
            // render, so `<Style>` emits once per page rather than once per site.
            initFlowAssets();
            const html = await renderToString(node());
            return adapter?.transformShell ? adapter.transformShell(html, ctx) : html;
          }, snapshot()),
        emitFragments: async (cb) => {
          if (!adapter) {
            throw new Error(
              `${PREFIX} emitFragments(): emitFragments requires an adapter — fragments cannot ` +
                "be framed into standalone files without one. Pass { adapter: ... } to renderToStatic. " +
                "Example: renderToStatic(handler, { adapter: NativeAdapter })",
            );
          }
          // Standalone fragment files carry no assets — the shell including them
          // already has them — so this scope suppresses emission, and `<Style>`
          // returns null rather than a tag a later pass would have to remove.
          await withScope(async () => {
            suppressFlowAssets();
            await flushTemplates(ctx, async (ev) => {
              if (ev.type === "fragment") {
                const framed = await renderToString(
                  adapter.Frame({ id: ev.id, children: raw(ev.html) }),
                );
                await cb(ev.id, generatePath(ev.id), framed);
              }
            });
          }, snapshot());
          // Emitted fragments leave the store. `flushTemplates` tracks what it
          // has processed only within one call, so without this the natural
          // site-generator loop — `renderPage(p); emitFragments(write)` per page
          // — re-emits every earlier fragment on every page: quadratic writes,
          // and each lazy factory replayed, so a `(signal) => fetch(...)` is
          // refetched once per remaining page. A fragment is written to a file
          // here; there is nothing left to drain.
          ctx.templateStore.clear();
        },
      };
      return handler(staticCtx);
    },
    { adapter, mode: "static", generatePath },
  );
}
