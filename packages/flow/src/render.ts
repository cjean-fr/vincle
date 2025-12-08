import { raw, renderToString, type JSX } from "@vincle/core";

import type { Adapter } from "./adapters/index.js";
import type { FlowEvent, FlowOptions, StreamingAdapter } from "./types.js";

import type { ShellContext } from "./adapters/shared.js";

import { withFlow } from "./context.js";
import { createStream } from "./create-stream.js";
import { flushTemplates } from "./flushTemplates.js";

/**
 * Split a trailing `</body></html>` — with whitespace anywhere between and
 * after — off the end of the shell.
 *
 * This used to be `/((?:<\/body>)?\s*<\/html>\s*)$/`, and that regex was
 * **quadratic**. Anchored only at the end, the engine retries from every start
 * position; inside a run of whitespace each attempt lets `\s*` consume to the
 * end before failing on `<\/html>`. Measured on a document that does not close
 * with `</html>`: 100 kB of contiguous whitespace took 5,3 s, and doubling the
 * run quadrupled the time (83 → 332 → 1332 → 5348 ms). A page carrying a large
 * whitespace run in user content is enough — `renderShell` runs this on every
 * render. Found by `redos-audit.test.ts` on its first run after it started
 * reading the sources instead of its own inventory.
 *
 * `trimEnd()` removes exactly the set `\s` matches (WhiteSpace ∪ LineTerminator
 * per spec), so the bytes are unchanged; a bounded number of linear passes
 * replaces the backtracking search.
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
 * separator that used to follow "the shell event" is written once, when the
 * first non-shell event proves the run is over.
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
 * `<Style>` / `<Script>` no longer need a resolution pass here — they emit their
 * tag during the render, deduplicating against `ctx.assets` as the walk reaches
 * them. That also removes an ordering constraint this function used to carry
 * silently: asset resolution had to run *after* `transformShell`, and nothing
 * said so.
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
  if (adapter.capabilities.streaming !== true) {
    throw new Error(
      "[vincle/flow] renderToStream requires an adapter with capabilities.streaming: true. " +
        "This adapter declares itself non-streaming — use renderToStatic for static output.",
    );
  }
  return renderToFlowEvents(node, adapter, opts).pipeThrough(encodeWith(adapter));
}
