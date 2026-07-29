/**
 * Chunked HTML rendering — the streaming counterpart of `renderToString`.
 *
 * Same tree walk, same output: joining every chunk yields a string
 * byte-identical to `await renderToString(node)`. The only difference is *when*
 * bytes leave: `renderToString` hands you the document once the last promise
 * settles, `renderToChunks` hands you every byte it already has each time it is
 * about to wait.
 *
 * That rule — **flush before you block** — is the whole design. Chunk boundaries
 * are suspension points, nothing else. A fully synchronous tree yields exactly
 * one chunk (no per-node fragmentation, no threshold to tune); a tree with three
 * async components yields four. Callers get the strongest guarantee a streaming
 * renderer can offer: if a byte is knowable, it has already been sent.
 *
 * ## Ordering
 *
 * Chunks are emitted in document order, so async siblings resolve one after the
 * other rather than concurrently as they do under `renderToString`. This is
 * deliberate: an HTML byte stream *is* ordered, and buying concurrency back here
 * would mean buffering later siblings while an earlier one blocks — trading away
 * the memory ceiling that makes streaming worth doing at all. Out-of-order
 * concurrency is a separate concern with a separate tool: `<Template>` / `<Slot>`
 * in `@vincle/flow`, which render independent regions in parallel and patch them
 * into place as they land.
 *
 * @module
 */

import { buildAttrs } from "./attrs.js";
import { escapeContent, escapeRawTagContent, isRawtextTag } from "./escape.js";
import { VNode } from "./jsx-runtime.js";
import { RawString } from "./raw.js";
import { invalidTagMessage, isValidTag, serializeElement } from "./serialize.js";

// `Symbol.asyncIterator in value` forces a prototype-chain lookup, and this test
// runs once per node. A property access goes through an inline cache and costs
// less: ~2% on `realworld` in an intra-run comparison — below the threshold of
// `bench:stats --against` at n=8, so not a publishable figure under ADR-003.
// `typeof === "function"` is stricter than `in` — an object carrying a
// non-callable `Symbol.asyncIterator` is no longer taken for an async iterable,
// though it would have failed to iterate anyway — and matches what
// `jsx-precompile-runtime.ts` already does for this protocol.
function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
  );
}

/**
 * Walk a JSX tree and yield HTML as it becomes available.
 *
 * @param node Anything renderable: `VNode`, `RawString`, primitive, array,
 *   `Promise`, or `AsyncIterable` thereof.
 * @returns An async generator of HTML fragments. Concatenated, they equal
 *   `renderToString(node)`.
 *
 * @example
 * ```ts
 * for await (const chunk of renderToChunks(<Page />)) {
 *   res.write(chunk);
 * }
 * ```
 */
export async function* renderToChunks(node: unknown): AsyncGenerator<string, void, undefined> {
  const pending: Pending = { html: "" };
  yield* streamNode(node, pending);
  if (pending.html !== "") yield pending.html;
}

/**
 * Bytes rendered but not yet handed to the consumer.
 *
 * A single mutable cell threaded through the whole walk, rather than a return
 * value per node: appending to it is the *only* thing the synchronous majority
 * of the tree ever does, and that has to stay free.
 */
interface Pending {
  html: string;
}

/**
 * Hand the consumer everything rendered so far, because we are about to wait.
 *
 * Every `await` in this module is preceded by this generator. That invariant is
 * what makes chunk boundaries meaningful — keep it that way.
 */
function* flush(pending: Pending): Generator<string, void, undefined> {
  if (pending.html !== "") {
    yield pending.html;
    pending.html = "";
  }
}

/**
 * Stream one node. Mirrors `renderNode` in create-element-async.ts branch for
 * branch — the two must stay interchangeable, and `path-equivalence.test.ts`
 * fails loudly if they drift.
 */
async function* streamNode(
  node: unknown,
  pending: Pending,
): AsyncGenerator<string, void, undefined> {
  // ── Leaves — append, never yield ──
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (typeof node === "string") {
    pending.html += escapeContent(node);
    return;
  }
  if (typeof node === "number" || typeof node === "bigint") {
    pending.html += String(node);
    return;
  }
  if (node instanceof RawString) {
    pending.html += node.value;
    return;
  }

  // ── Suspension points — flush, then wait ──
  if (node instanceof Promise) {
    yield* flush(pending);
    yield* streamNode(await node, pending);
    return;
  }
  if (Array.isArray(node)) {
    yield* streamChildren(node, pending, undefined);
    return;
  }
  // Neither an array nor a VNode is ever an async iterable, and the VNode is the
  // dominant case: only what is left pays for the protocol test. Mirrors the
  // order in `renderNode` — the two must stay interchangeable.
  if (!(node instanceof VNode)) {
    if (isAsyncIterable(node)) {
      yield* streamAsyncIterable(node, pending);
      return;
    }
    pending.html += escapeContent(String(node));
    return;
  }

  // ── Component ──
  if (typeof node.tag === "function") {
    yield* streamNode(node.tag(node.attrs), pending);
    return;
  }

  // ── Element ──
  const { tag, attrs, children } = node;

  if (!isValidTag(tag)) throw new TypeError(invalidTagMessage(tag));

  const attrStr = buildAttrs(attrs);

  // No children: `serializeElement` owns the void-element decision (`<br>`, no
  // closing tag). Delegating keeps every renderer byte-identical.
  if (children === undefined) {
    pending.html += serializeElement(tag, attrStr, "", false);
    return;
  }

  pending.html += `<${tag}${attrStr}>`;
  yield* streamChildren(children, pending, isRawtextTag(tag) ? tag : undefined);
  pending.html += `</${tag}>`;
}

/**
 * Stream an element's children. `rawtextTag` applies to *direct* string children
 * only — `<script>` escaping is local to the element, never inherited by nested
 * nodes, exactly as in `renderChildrenAsync`.
 */
async function* streamChildren(
  children: unknown,
  pending: Pending,
  rawtextTag: string | undefined,
): AsyncGenerator<string, void, undefined> {
  if (typeof children === "string") {
    pending.html += rawtextTag
      ? escapeRawTagContent(children, rawtextTag)
      : escapeContent(children);
    return;
  }
  if (!Array.isArray(children)) {
    yield* streamNode(children, pending);
    return;
  }
  for (const child of children) {
    if (typeof child === "string") {
      pending.html += rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeContent(child);
    } else {
      yield* streamNode(child, pending);
    }
  }
}

/**
 * Drain an async iterable, flushing before every pull.
 *
 * `for await` suspends *before* running its body, so the flush has to sit on
 * this side of `iterator.next()` to stay ahead of the wait.
 */
async function* streamAsyncIterable(
  iterable: AsyncIterable<unknown>,
  pending: Pending,
): AsyncGenerator<string, void, undefined> {
  const iterator = iterable[Symbol.asyncIterator]();
  try {
    for (;;) {
      yield* flush(pending);
      const step = await iterator.next();
      if (step.done === true) return;
      yield* streamNode(step.value, pending);
    }
  } finally {
    await iterator.return?.();
  }
}
