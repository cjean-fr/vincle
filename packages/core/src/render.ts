import { buildAttrs } from "./attrs.js";
import { escapeContent, escapeRawTagContent, isAsyncIterable, isIterable, isRawtextTag, valueToText } from "./escape.js";
import { serializeElement } from "./serialize.js";
import { RawString, VNode } from "./types.js";

// ── Shared helpers ────────────────────────────────────────────────────────
//
// Property access beats `Symbol.asyncIterator in value`, and `typeof ===
// "function"` is stricter — a non-callable `Symbol.asyncIterator` is no longer
// mistaken for an async iterable.

// ═══════════════════════════════════════════════════════════════════════════
// renderToString
// ═══════════════════════════════════════════════════════════════════════════

export function renderToString(node: unknown): Promise<string> {
  try {
    return Promise.resolve(renderNode(node));
  } catch (error) {
    // The signature promises a `Promise<string>`, so every failure has to arrive
    // as a rejection. The component branch below was already written to convert a
    // synchronous throw; `buildAttrs` (a function as an attribute value) was not
    // covered by it and escaped past `.catch()` handlers.
    return Promise.reject(error);
  }
}

/**
 * Recursive tree walk (async variant).
 *
 * Does NOT accept a `rawtextTag` — `<script>` / `<style>` escaping is managed
 * locally in `renderChildrenAsync`, not inherited.
 *
 * Exported for the precompile helpers (`jsxTemplate` renders the VNodes the
 * transform leaves in template holes — the Deno/Preact contract — through the
 * same walk, so every path emits the same bytes).
 *
 * @internal
 */
export function renderNode(vnode: unknown): string | Promise<string> {
  // ── Sync fast path ──
  // Inline copy of the leaf taxonomy — delegation is measurably slower, and
  // `escape.test.ts` pins the copy to `valueToText`.
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string") return escapeContent(vnode);
  if (typeof vnode === "number" || typeof vnode === "bigint") return String(vnode);
  if (vnode instanceof RawString) return vnode.value;

  // ── Async primitives ──
  if (vnode instanceof Promise) {
    return vnode.then((resolved) => renderNode(resolved));
  }
  if (Array.isArray(vnode)) return renderChildrenAsync(vnode);
  if (vnode instanceof VNode) {
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
    // The tag name was validated by `jsx()`, the only gate a string tag can come
    // through; re-checking here charged every element for the same answer twice.
    const { tag, attrs, children } = vnode;

    const attrStr = buildAttrs(attrs);
    const childTag = isRawtextTag(tag) ? tag : undefined;

    // A promised attribute value (`<a href={resolveUrl()}>`) — the only reason
    // `buildAttrs` asks to be awaited. Once we are async anyway, the element
    // reduces to its two parts, so there is nothing here to keep in step with the
    // synchronous form below.
    if (typeof attrStr !== "string") {
      return attrStr.then(async (resolved) =>
        serializeElement(
          tag,
          resolved,
          children === undefined ? "" : await renderChildrenAsync(children, childTag),
          children !== undefined,
        ),
      );
    }

    if (children !== undefined) {
      const content = renderChildrenAsync(children, childTag);
      if (content instanceof Promise) {
        return content.then((c) => serializeElement(tag, attrStr, c, true));
      }
      return serializeElement(tag, attrStr, content, true);
    }
    return serializeElement(tag, attrStr, "", false);
  }
  // Neither an array nor a VNode is ever an async iterable, and VNode is the
  // dominant case: only what is left pays for the protocol tests.
  // Order mirrors `streamNode` — they must stay interchangeable.
  if (isAsyncIterable(vnode)) return collectAsyncIterable(vnode);
  if (isIterable(vnode)) return renderChildrenAsync(Array.from(vnode));
  return valueToText(vnode);
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
  // on `realworld` (V8 profile), GC included.
  let out = "";
  for (let i = 0; i < children.length; i++) {
    const part = renderChild(children[i], rawtextTag);
    // First child that suspends: the rest is finished by the sequential tail.
    // What is already rendered stays a plain string, never an array element.
    if (typeof part !== "string") return renderChildrenFrom(out, part, children, i + 1, rawtextTag);
    out += part;
  }
  return out;
}

/**
 * Finish a child list whose `from - 1`-th element suspended — one child at a
 * time, each started only once its left sibling is done.
 *
 * This is the sequencing rule of the whole engine, and it is not an
 * implementation detail: **components execute in document order.** The previous
 * form started every remaining sibling before awaiting any of them
 * (`Promise.all`), which overlapped their I/O — and made the rendered document
 * depend on how long that I/O took:
 *
 *   <div><Writer/><Reader/></div>   // Writer awaits, then setContext(K, "b")
 *   Reader fast  →  <div>…a…</div>
 *   Reader slow  →  <div>…b…</div>
 *
 * Same tree, same code, two documents. Context is a mutable execution stack (see
 * `context.ts`), so overlapping siblings race on it: nothing in the tree said
 * which of the two results was the right one, and `renderToChunks` — ordered by
 * necessity, since bytes leave in order — silently produced the other. Ordering
 * the walk removes the race instead of documenting it, and makes the two
 * renderers agree by construction rather than by test.
 *
 * The overlap is a real thing to give up, and the project already has the tool
 * that buys it back deliberately, with a boundary in the markup to show where it
 * happens: `<Template>` / `<Slot>` in `@vincle/flow`. Concurrency you can see is
 * worth more than concurrency that rewrites your HTML behind you.
 */
async function renderChildrenFrom(
  prefix: string,
  pending: Promise<string>,
  children: unknown[],
  from: number,
  rawtextTag: string | undefined,
): Promise<string> {
  let out = prefix + (await pending);
  for (let i = from; i < children.length; i++) {
    const part = renderChild(children[i], rawtextTag);
    out += typeof part === "string" ? part : await part;
  }
  return out;
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
