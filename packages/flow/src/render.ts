import { renderToChunks, renderToString, type JSX } from "@vincle/core";

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
  node: () => JSX.Element,
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
 * Stream the shell, yielding each chunk as `renderToChunks` releases it and
 * returning the closing tag for the caller to emit last.
 *
 * The shell is a page, not a payload: its `<head>` is knowable long before a
 * slow component in its `<body>` settles, and holding it back costs a round trip
 * of stylesheet and font discovery on every request. `renderToChunks` flushes at
 * every suspension point, so the browser starts parsing as soon as there is
 * anything to parse.
 *
 * **When it falls back to buffering.** An adapter's `transformShell` takes the
 * whole shell — `injectIntoHead` is the canonical case, and it may need to know
 * something only the *end* of the render establishes (`withPolyfill` reads
 * `ctx.templateStore.size`, which fills as the body renders). A transform of the
 * whole document cannot be applied to a prefix of it, so declaring one opts the
 * adapter out of shell streaming. Adapters that want the shell streamed should
 * express themselves as components instead.
 *
 * @returns The closing `</body></html>`, empty if the shell had none.
 */
async function* streamShell(
  node: () => JSX.Element,
  adapter: { transformShell?: (html: string, ctx: FlowContext) => string },
  ctx: FlowContext,
): AsyncGenerator<string, string, undefined> {
  if (adapter.transformShell) {
    const { shellBody, closingTag } = await renderShell(node, adapter, ctx);
    if (shellBody !== "") yield shellBody;
    return closingTag;
  }

  let carry = "";
  for await (const chunk of renderToChunks(node())) {
    // Resolve before cutting, never after. A marker is written by one `raw()`
    // node, so it lands in a chunk whole — resolving here leaves the buffer
    // marker-free, and the cut below cannot fall inside one.
    carry = await resolveAssets(carry + chunk, ctx.assets);
    const keep = closingRunLength(carry);
    if (keep < carry.length) {
      yield carry.slice(0, carry.length - keep);
      carry = carry.slice(carry.length - keep);
    }
  }

  const closingTag = carry.match(REGEX_SHELL_CLOSE)?.[1] ?? "";
  const body = closingTag ? carry.slice(0, -closingTag.length) : carry;
  if (body !== "") yield body;
  return closingTag;
}

/**
 * Length of the trailing run that `REGEX_SHELL_CLOSE` could still claim.
 *
 * The closing tags are only recognisable once the shell ends, so that much has
 * to be withheld — but only that much. Withholding a whole chunk instead would
 * pin the `<head>` behind the first slow component and undo the streaming.
 *
 * A partial tag can never end a chunk: closing tags are appended with no
 * suspension between them, so they arrive whole, in the last chunk.
 */
function closingRunLength(html: string): number {
  let end = html.length;
  const skipSpace = () => {
    while (end > 0 && /\s/.test(html[end - 1]!)) end--;
  };
  const skipTag = (tag: string) => {
    if (html.endsWith(tag, end)) end -= tag.length;
  };
  skipSpace();
  skipTag("</html>");
  skipSpace();
  skipTag("</body>");
  return html.length - end;
}

/**
 * Run the full streaming sequence: emit shell → drain templates → emit close.
 * Skips shell/close when `opts.mode === "fragment"`.
 */
export async function runSequence(
  emit: (ev: FlowEvent) => Promise<void>,
  signal: AbortSignal,
  node: () => JSX.Element,
  adapter: Adapter,
  opts: FlowOptions & { mode?: "full" | "fragment" },
): Promise<void> {
  await withFlow(
    async (ctx) => {
      const { templateStore } = ctx;
      try {
        if (signal.aborted) return;

        // Fragment mode still renders the shell — that render is what registers
        // the templates we are about to drain — but none of it reaches the wire.
        const shell = streamShell(node, adapter, ctx);
        let step = await shell.next();
        while (step.done !== true) {
          if (opts.mode !== "fragment") await emit({ type: "shell", html: step.value });
          step = await shell.next();
        }
        const closingTag = step.value;

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
  node: () => JSX.Element,
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
  node: () => JSX.Element,
  adapter: StreamingAdapter,
  opts?: FlowOptions & { mode?: "full" | "fragment" },
): ReadableStream<string> {
  return renderToFlowEvents(node, adapter, opts).pipeThrough(adapter.encode());
}
