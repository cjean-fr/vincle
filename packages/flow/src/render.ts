import type { Adapter } from "./adapters/index.js";
import { resolveAssets } from "./assets.js";
import { withFlow, type FlowContext } from "./context.js";
import { createFlowStream } from "./create-flow-stream.js";
import { streamFlow } from "./streamFlow.js";
import type { FlowEvent, FlowOptions, StreamingAdapter } from "./types.js";
import { renderToString, type VincleNode } from "@vincle/core";

const REGEX_SHELL_CLOSE = /((?:<\/body>)?\s*<\/html>\s*)$/;

/**
 * Render the page shell: run the node factory, strip closing `</body></html>`
 * tags, apply `adapter.transformShell` if present, then resolve asset markers
 * (`<Style>` / `<Script>`) — the shell is fully buffered at this point, so
 * every declaration in it has been seen.
 *
 * @returns The transformed shell body (minus closing tags) and the raw closing
 *   tag, so callers can emit them as separate `shell` / `close` events.
 *
 * @example
 * const { shellBody, closingTag } = await renderShell(() => <App />, adapter);
 * // shellBody: "<html><body><p>hi</p>"
 * // closingTag: "\n</body>\n</html>"
 */
export async function renderShell(
  node: () => VincleNode,
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
 * Run the full streaming sequence: emit shell → drain fragments → emit close.
 * Skips shell/close when `opts.mode === "fragment"`.
 *
 * Encapsulates the three‑step orchestration so `renderToFlowEvents` focuses on
 * stream lifecycle.
 */
export async function orchestrateFlow(
  emit: (ev: FlowEvent) => Promise<void>,
  signal: AbortSignal,
  node: () => VincleNode,
  adapter: Adapter,
  opts: FlowOptions & { mode?: "full" | "fragment" },
): Promise<void> {
  await withFlow(
    async (ctx) => {
      const { pendingStore } = ctx;
      try {
        if (signal.aborted) return;
        const { shellBody, closingTag } = await renderShell(node, adapter, ctx);
        if (opts.mode !== "fragment") {
          await emit({ type: "shell", html: shellBody });
        }
        // Fragments render after the shell went out: resolve their asset
        // markers against the same request state, so a name the shell (or an
        // earlier fragment) already emitted vanishes and a new one lands
        // inline with the first fragment that declares it.
        const emitResolved = async (ev: FlowEvent) =>
          emit(
            ev.type === "fragment"
              ? { ...ev, html: await resolveAssets(ev.html, ctx.assets) }
              : ev,
          );
        await streamFlow({ pendingStore }, emitResolved, { ...opts, signal });
        if (opts.mode !== "fragment" && closingTag) {
          await emit({ type: "close", html: closingTag });
        }
      } finally {
        pendingStore.clear();
      }
    },
    { adapter, mode: "streaming" },
  );
}

/**
 * Return a `ReadableStream<FlowEvent>` with proper backpressure and cancellation.
 *
 * - `pull()` is called by the consumer; `emit()` waits when `desiredSize <= 0`.
 * - `cancel(reason)` and `opts.signal` both feed one combined `AbortSignal`
 *   (pre-aborted signals included), which stops fragment rendering, generator
 *   iteration, and releases any producer parked on backpressure.
 */
export function renderToFlowEvents(
  node: () => VincleNode,
  adapter: StreamingAdapter,
  opts: FlowOptions & { mode?: "full" | "fragment" } = {},
): ReadableStream<FlowEvent> {
  return createFlowStream(
    (emit, signal) => orchestrateFlow(emit, signal, node, adapter, opts),
    {
      signal: opts.signal,
    },
  );
}

/**
 * Render to a `ReadableStream<string>` of adapter-encoded HTML — the shell
 * followed by each fragment as wire-format markup. This is the stream you
 * put in an HTTP response body. Non-streaming adapters (ESI) are rejected
 * at compile time.
 *
 * @example
 * const stream = renderStream(() => <App />, NativeAdapter);
 * const stream = renderStream(() => <App />, TurboAdapter);
 */
export function renderStream(
  node: () => VincleNode,
  adapter: StreamingAdapter,
  opts?: FlowOptions & { mode?: "full" | "fragment" },
): ReadableStream<string> {
  return renderToFlowEvents(node, adapter, opts).pipeThrough(adapter.encode());
}
