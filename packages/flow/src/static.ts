import { raw, renderToString, snapshot, useContext, withScope, type VNode } from "@vincle/core";

import type { Adapter } from "./adapters/index.js";
import type { FlowContext } from "./context.js";

import { resolveAssets } from "./assets.js";
import { Flow, withFlow, initFlowAssets } from "./context.js";
import { flushTemplates } from "./flushTemplates.js";

const DEFAULT_GENERATE_PATH = (id: string) => `/fragments/${id}.html`;

/**
 * Static generation context for pure-static pages — no adapter, no fragment
 * emission. When `renderToStatic` is called without options, the handler
 * receives this type and cannot call `emitFragments`.
 */
export interface PureStaticContext extends FlowContext {
  /** Render a page node, applying adapter.transformShell if present. */
  renderPage(node: () => VNode): Promise<string>;
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

  return withFlow(
    async (ctx) => {
      const staticCtx: StaticContext = {
        ...ctx,
        renderPage: (node) =>
          withScope(async () => {
            initFlowAssets();
            const html = await renderToString(node());
            const { assets } = useContext(Flow);
            const transformed = adapter?.transformShell ? adapter.transformShell(html, ctx) : html;
            return resolveAssets(transformed, assets);
          }, snapshot()),
        emitFragments: async (cb) => {
          if (!adapter) {
            throw new Error(
              "emitFragments requires an adapter. " +
                "Pass { adapter: ... } to renderToStatic. " +
                "Example: renderToStatic(handler, { adapter: NativeAdapter })",
            );
          }
          await flushTemplates(ctx, async (ev) => {
            if (ev.type === "fragment") {
              const resolved = await resolveAssets(ev.html, { isolate: true });
              const framed = await renderToString(
                adapter.Frame({ id: ev.id, children: raw(resolved) }),
              );
              await cb(ev.id, generatePath(ev.id), framed);
            }
          });
        },
      };
      return handler(staticCtx);
    },
    { adapter, mode: "static", generatePath },
  );
}
