import { renderToString, type VNode } from "@vincle/core";

import type { Adapter } from "./adapters/index.js";
import type { FlowEvent, FlowOptions, StreamingAdapter } from "./types.js";

import { resolveAssets } from "./assets.js";
import { withFlow, type FlowContext } from "./context.js";
import { createStream } from "./create-stream.js";
import { flushTemplates } from "./flushTemplates.js";

const REGEX_SHELL_CLOSE = /((?:<\/body>)?\s*<\/html>\s*)$/;

/**
 * Render the page shell: run the node factory, strip closing `</body></html>`
 * tags, apply `adapter.transformShell` if present, then resolve asset markers
 * (`<Style>` / `<Script>`) — the shell is fully buffered at this point, so
 * every declaration in it has been seen.
 *
 * @returns The transformed shell body (minus closing tags) and the raw closing
 *   tag, so callers can emit them as separate `shell` / `close` events.
 */
export async function renderShell(
  node: () => VNode,
  adapter: {
    transformShell?: (html: string, ctx: FlowContext) => string;
  },
  ctx: FlowContext,
): Promise<{ shellBody: string; closingTag: string }> {
  const shell = await renderToString(node());
  const match = shell.match(REGEX_SHELL_CLOSE);
  const closingTag = match?.[1] ?? "";
  const body = closingTag ? shell.slice(0, -closingTag.length) : shell;
  const shellBody = await resolveAssets(
    adapter.transformShell ? adapter.transformShell(body, ctx) : body,
    ctx.assets,
  );
  return { shellBody, closingTag };
}

/**
 * Run the full streaming sequence: emit shell → drain templates → emit close.
 * Skips shell/close when `opts.mode === "fragment"`.
 */
export async function runSequence(
  emit: (ev: FlowEvent) => Promise<void>,
  signal: AbortSignal,
  node: () => VNode,
  adapter: Adapter,
  opts: FlowOptions & { mode?: "full" | "fragment" },
): Promise<void> {
  await withFlow(
    async (ctx) => {
      const { templateStore } = ctx;
      try {
        if (signal.aborted) return;
        const { shellBody, closingTag } = await renderShell(node, adapter, ctx);
        if (opts.mode !== "fragment") {
          await emit({ type: "shell", html: shellBody });
        }
        const emitResolved = async (ev: FlowEvent) =>
          emit(
            ev.type === "fragment" ? { ...ev, html: await resolveAssets(ev.html, ctx.assets) } : ev,
          );
        await flushTemplates({ templateStore }, emitResolved, { ...opts, signal });
        if (opts.mode !== "fragment" && closingTag) {
          await emit({ type: "close", html: closingTag });
        }
      } finally {
        templateStore.clear();
      }
    },
    { adapter, mode: "streaming" },
  );
}

/**
 * Return a `ReadableStream<FlowEvent>` with proper backpressure and cancellation.
 */
export function renderToFlowEvents(
  node: () => VNode,
  adapter: StreamingAdapter,
  opts: FlowOptions & { mode?: "full" | "fragment" } = {},
): ReadableStream<FlowEvent> {
  return createStream((emit, signal) => runSequence(emit, signal, node, adapter, opts), {
    signal: opts.signal,
  });
}

/**
 * Render to a `ReadableStream<string>` of adapter-encoded HTML — the shell
 * followed by each fragment as wire-format markup.
 */
export function renderToStream(
  node: () => VNode,
  adapter: StreamingAdapter,
  opts?: FlowOptions & { mode?: "full" | "fragment" },
): ReadableStream<string> {
  return renderToFlowEvents(node, adapter, opts).pipeThrough(adapter.encode());
}
