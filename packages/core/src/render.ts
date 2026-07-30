import { buildAttrs } from "./attrs.js";
import { escapeContent, escapeRawTagContent, isRawtextTag } from "./escape.js";
import { VNode } from "./jsx-runtime.js";
import { RawString } from "./types.js";
import { invalidTagMessage, isValidTag, serializeElement } from "./serialize.js";

// ── Shared helper ─────────────────────────────────────────────────────────
//
// A property access goes through an inline cache and costs less than
// `Symbol.asyncIterator in value` (~2% on `realworld` in intra-run comparison).
// `typeof === "function"` is stricter — an object with a non-callable
// `Symbol.asyncIterator` is no longer mistaken for an async iterable, matching
// the same test in `jsx-runtime.ts`.

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// renderToString
// ═══════════════════════════════════════════════════════════════════════════

export function renderToString(node: unknown): Promise<string> {
  return Promise.resolve(renderNode(node));
}

/**
 * Recursive tree walk (async variant).
 *
 * Does NOT accept a `rawtextTag` — `<script>` / `<style>` escaping is managed
 * locally in `renderChildrenAsync`, not inherited.
 */
function renderNode(vnode: unknown): string | Promise<string> {
  // ── Sync fast path ──
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string") return escapeContent(vnode);
  if (typeof vnode === "number" || typeof vnode === "bigint") return String(vnode);
  if (vnode instanceof RawString) return vnode.value;

  // ── Async primitives ──
  if (vnode instanceof Promise) {
    return vnode.then((resolved) => renderNode(resolved));
  }
  if (Array.isArray(vnode)) return renderChildrenAsync(vnode);
  // Neither an array nor a VNode is ever an async iterable, and VNode is the
  // dominant case: only what is left pays for the protocol test.
  // Order mirrors `streamNode` — they must stay interchangeable.
  if (!(vnode instanceof VNode)) {
    if (isAsyncIterable(vnode)) return collectAsyncIterable(vnode);
    return escapeContent(String(vnode));
  }

  // ── Component ──
  if (typeof vnode.tag === "function") {
    let result: unknown;
    try {
      result = vnode.tag(vnode.attrs);
    } catch (e) {
      return Promise.reject(e);
    }
    if (result instanceof Promise) {
      return result.then((r) => renderNode(r));
    }
    if (isAsyncIterable(result)) {
      return collectAsyncIterable(result);
    }
    return renderNode(result);
  }

  // ── Regular element ──
  const { tag, attrs, children } = vnode;

  if (!isValidTag(tag)) throw new TypeError(invalidTagMessage(tag));

  const attrStr = buildAttrs(attrs);
  const childTag = isRawtextTag(tag) ? tag : undefined;

  if (children !== undefined) {
    const content = renderChildrenAsync(children, childTag);
    if (content instanceof Promise) {
      return content.then((c) => serializeElement(tag, attrStr, c, true));
    }
    return serializeElement(tag, attrStr, content, true);
  }
  return serializeElement(tag, attrStr, "", false);
}

function renderChildrenAsync(children: unknown, rawtextTag?: string): string | Promise<string> {
  if (!Array.isArray(children)) {
    if (typeof children === "string") {
      return rawtextTag ? escapeRawTagContent(children, rawtextTag) : escapeContent(children);
    }
    return renderNode(children);
  }
  if (children.length === 0) return "";

  // Concatenate directly instead of filling an array then joining; the
  // intermediate array was the first cost centre of the renderer — 35% of time
  // on `realworld` (V8 profile), GC included. The array only appears at the
  // first truly async child, and it carries only the suffix: the prefix already
  // rendered stays a plain string.
  let out = "";
  let deferred: Promise<string> | undefined;
  let i = 0;

  for (; i < children.length; i++) {
    const part = renderChild(children[i], rawtextTag);
    if (typeof part !== "string") {
      deferred = part;
      break;
    }
    out += part;
  }
  if (deferred === undefined) return out;

  const parts: (string | Promise<string>)[] = [out, deferred];
  for (i++; i < children.length; i++) parts.push(renderChild(children[i], rawtextTag));
  return Promise.all(parts).then((resolved) => resolved.join(""));
}

/**
 * Render one child. Direct strings carry rawtext escaping (`<script>` /
 * `<style>`); everything else passes through `renderNode` without inheriting
 * the rawtextTag.
 */
function renderChild(child: unknown, rawtextTag: string | undefined): string | Promise<string> {
  if (typeof child === "string") {
    return rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeContent(child);
  }
  return renderNode(child);
}

async function collectAsyncIterable(iterable: AsyncIterable<unknown>): Promise<string> {
  let out = "";
  for await (const chunk of iterable) {
    const rendered = renderNode(chunk);
    out += rendered instanceof Promise ? await rendered : rendered;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// renderToChunks  (streaming)
// ═══════════════════════════════════════════════════════════════════════════
//
// Same tree walk, same output: joining every chunk yields a string
// byte-identical to `await renderToString(node)`. The only difference is *when*
// bytes leave: `renderToString` hands you the document once the last promise
// settles, `renderToChunks` hands you every byte it already has each time it is
// about to wait.
//
// That rule — **flush before you block** — is the whole design. Chunk boundaries
// are suspension points, nothing else. A fully synchronous tree yields exactly
// one chunk (no per-node fragmentation); a tree with three async components
// yields four. Callers get the strongest guarantee a streaming renderer can
// offer: if a byte is knowable, it has already been sent.
//
// Chunks are emitted in document order, so async siblings resolve one after the
// other rather than concurrently as they do under `renderToString`. This is
// deliberate: an HTML byte stream *is* ordered, and buying concurrency back here
// would mean buffering later siblings while an earlier one blocks — trading away
// the memory ceiling that makes streaming worth doing. Out-of-order concurrency
// is a separate concern with a separate tool: `<Template>` / `<Slot>` in
// `@vincle/flow`.

export async function* renderToChunks(node: unknown): AsyncGenerator<string, void, undefined> {
  const pending: Pending = { html: "" };
  yield* streamNode(node, pending);
  if (pending.html !== "") yield pending.html;
}

/** Bytes rendered but not yet handed to the consumer. */
interface Pending {
  html: string;
}

/**
 * Hand the consumer everything rendered so far, because we are about to wait.
 *
 * Every `await` in this module is preceded by this generator. That invariant is
 * what makes chunk boundaries meaningful.
 */
function* flush(pending: Pending): Generator<string, void, undefined> {
  if (pending.html !== "") {
    yield pending.html;
    pending.html = "";
  }
}

/**
 * Stream one node. Mirrors `renderNode` branch for branch — they must stay
 * interchangeable, and `path-equivalence.test.ts` fails loudly if they drift.
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
  // Order mirrors `renderNode` — they must stay interchangeable.
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

  if (children === undefined) {
    pending.html += serializeElement(tag, attrStr, "", false);
    return;
  }

  pending.html += `<${tag}${attrStr}>`;
  yield* streamChildren(children, pending, isRawtextTag(tag) ? tag : undefined);
  pending.html += `</${tag}>`;
}

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
  // Indexed, not `for…of`: iterating an array through the iterator protocol
  // allocates an iterator and a result object per step. Measured on the shape
  // alone, concatenating n strings: 9.0 vs 5.8 ns at n=2, 4.27 vs 4.05 µs at
  // n=1000. `renderChildrenAsync` above is already indexed for the same reason.
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (typeof child === "string") {
      pending.html += rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeContent(child);
    } else {
      yield* streamNode(child, pending);
    }
  }
}

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
