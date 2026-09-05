import { raw, renderToString, type JSX } from "@vincle/core";

import type { Adapter } from "./adapters/index.js";
import type { ShellContext } from "./adapters/shared.js";
import type { FlowEvent, FlowOptions, StreamingAdapter } from "./types.js";

import { assertAdapter, assertFlowOptions } from "./config.js";
import { withFlow } from "./context.js";
import { createStream } from "./create-stream.js";
import { flushTemplates } from "./flushTemplates.js";

/**
 * Split a trailing `</body></html>` — with whitespace anywhere between and
 * after — off the end of the shell.
 *
 * String scanning, not a regex: an end-anchored `/((?:<\/body>)?\s*<\/html>\s*)$/`
 * is quadratic on a shell that does not close with `</html>`, because every start
 * position lets `\s*` run to the end before failing (100 kB of contiguous
 * whitespace: 5,3 s, and doubling the run quadruples it). `renderShell` runs on
 * every render, so a long whitespace run in user content is enough to reach it.
 * `trimEnd()` removes exactly what `\s` matches (WhiteSpace ∪ LineTerminator per
 * spec), so the bytes are unchanged. `redos-audit.test.ts` scans this file, so a
 * regex reintroduced here fails until it is declared and shown to be safe.
 */
function splitClosingTags(shell: string): { body: string; closingTag: string } {
  const withoutTrailing = shell.trimEnd();
  if (!withoutTrailing.endsWith("</html>")) return { body: shell, closingTag: "" };

  const beforeHtml = withoutTrailing.slice(0, -"</html>".length).trimEnd();
  const cut = beforeHtml.endsWith("</body>")
    ? beforeHtml.length - "</body>".length
    : beforeHtml.length;

  return { body: shell.slice(0, cut), closingTag: shell.slice(cut) };
}

/**
 * Turn the event sequence into wire bytes: the shell run, then each event
 * separated from the next. This is the primitive's job, not an adapter's —
 * every streaming adapter serializes events the same way, and only the
 * fragment framing (`Patch`) differs between them.
 *
 * The shell arrives as a run of chunks, not one event. They are consecutive
 * slices of the same document, so nothing may be inserted between them — the
 * separator is written once, when the first non-shell event proves the run is
 * over.
 */
function encodeWith(adapter: Pick<Adapter, "Patch">): TransformStream<FlowEvent, string> {
  let inShell = false;

  return new TransformStream<FlowEvent, string>({
    async transform(ev, c) {
      if (ev.type === "shell") {
        inShell = true;
        c.enqueue(ev.html);
        return;
      }
      // Ride the separator on the next write rather than enqueuing it alone, so
      // a single-chunk shell produces exactly the writes it always did.
      let prefix = "";
      if (inShell) {
        inShell = false;
        prefix = "\n";
      }
      if (ev.type === "fragment") {
        const wire = await renderToString(
          adapter.Patch({
            id: ev.id,
            children: raw(ev.html),
            merge: ev.merge,
          }),
        );
        c.enqueue(prefix + wire + "\n");
      } else {
        c.enqueue(prefix + ev.html + "\n");
      }
    },
    flush(c) {
      // Shell-only stream (no fragments, no closing tag): the separator still owes.
      if (inShell) c.enqueue("\n");
    },
  });
}

/**
 * Render the page shell: run the node factory, strip closing `</body></html>`
 * tags, then apply `adapter.transformShell` if present.
 *
 * `<Style>` / `<Script>` emit their tag during the render, deduplicating against
 * `ctx.assets` as the walk reaches them, so there is no resolution pass here —
 * and so nothing to order against `transformShell`.
 *
 * @returns The transformed shell body (minus closing tags) and the raw closing
 *   tag, so callers can emit them as separate `shell` / `close` events.
 */
export async function renderShell(
  node: () => JSX.Element,
  adapter: {
    transformShell?: (html: string, ctx: ShellContext) => string;
  },
  ctx: ShellContext,
): Promise<{ shellBody: string; closingTag: string }> {
  const shell = await renderToString(node());
  const { body, closingTag } = splitClosingTags(shell);
  const shellBody = adapter.transformShell ? adapter.transformShell(body, ctx) : body;
  return { shellBody, closingTag };
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
        const { shellBody, closingTag } = await renderShell(node, adapter, ctx);
        if (opts.mode !== "fragment" && shellBody !== "") {
          await emit({ type: "shell", html: shellBody });
        }

        // Fragments dedupe against the same `ctx.assets` the shell used, and they
        // render after it, so an asset the shell already emitted is suppressed at
        // the component and a new one is emitted — with no pass over their HTML.
        await flushTemplates({ templateStore }, emit, { ...opts, signal });
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
 * Validate the streaming entry's inputs before a single byte is rendered:
 * the adapter must be complete, the options must be well-formed. Both public
 * streaming entry points call this, so a misconfiguration fails at setup.
 */
function assertStreamInput(source: string, adapter: Adapter, opts: FlowOptions | undefined): void {
  assertFlowOptions(opts, source);
  assertAdapter(adapter, source);
}

/**
 * Return a `ReadableStream<FlowEvent>` with proper backpressure and cancellation.
 */
export function renderToFlowEvents(
  node: () => JSX.Element,
  adapter: StreamingAdapter,
  opts: FlowOptions & { mode?: "full" | "fragment" } = {},
): ReadableStream<FlowEvent> {
  assertStreamInput("renderToFlowEvents", adapter, opts);
  return createStream((emit, signal) => runSequence(emit, signal, node, adapter, opts), {
    signal: opts.signal,
  });
}

/**
 * Render to a `ReadableStream<string>` of adapter-encoded HTML — the shell
 * followed by each fragment as wire-format markup.
 *
 * The wire is the primitive's own serialization (`encodeWith`); an adapter
 * only has to declare it can stream (`capabilities.streaming: true`). The
 * runtime check keeps a plain-JS caller from running a static adapter (e.g.
 * ESI) through the streaming path.
 */
export function renderToStream(
  node: () => JSX.Element,
  adapter: StreamingAdapter,
  opts?: FlowOptions & { mode?: "full" | "fragment" },
): ReadableStream<string> {
  assertStreamInput("renderToStream", adapter, opts);
  if (adapter.capabilities.streaming !== true) {
    throw new Error(
      "[vincle/flow] renderToStream(): this adapter does not stream — capabilities.streaming is false, " +
        "so it can only produce static output. Use renderToStatic() with this adapter, or pass a " +
        "streaming adapter (TurboAdapter, NativeAdapter, HtmxAdapter, WebPlatformAdapter).",
    );
  }
  return renderToFlowEvents(node, adapter, opts).pipeThrough(encodeWith(adapter));
}
