import { buildAttrs } from "./attrs.js";
import {
  escapeContent,
  escapeRawTagContent,
  isAsyncIterable,
  isIterable,
  isRawtextTag,
  valueToText,
} from "./escape.js";
import { serializeElement } from "./serialize.js";
import { RawString, VNode } from "./types.js";

/**
 * Render a JSX tree to an HTML string. Text is escaped; only `raw()` is not.
 *
 * Components may be async, and any nesting of promises, arrays, iterables and
 * async iterables resolves in document order. Every failure arrives as a
 * rejection, never as a synchronous throw.
 *
 * @example
 * ```tsx
 * import { renderToString, raw } from "@vincle/core";
 *
 * async function Comments({ postId }: { postId: string }) {
 *   const list = await fetchComments(postId);
 *   return <ul>{list.map((c) => <li>{c.body}</li>)}</ul>;
 * }
 *
 * await renderToString(
 *   <article>
 *     <h1>{title}</h1>
 *     {raw(trustedHtml)}
 *     <Comments postId="1" />
 *   </article>,
 * );
 * ```
 */
export function renderToString(node: unknown): Promise<string> {
  try {
    return Promise.resolve(renderNode(node));
  } catch (error) {
    // The signature promises a `Promise<string>`; a synchronous throw would
    // escape the caller's `.catch()`.
    return Promise.reject(error);
  }
}

/**
 * Recursive tree walk. Exported for the precompile helpers, so every path emits
 * the same bytes. Rawtext escaping is local to `renderChildrenAsync`, not
 * inherited.
 *
 * @internal
 */
export function renderNode(vnode: unknown): string | Promise<string> {
  // Leaf taxonomy inlined rather than delegated to `valueToText` — measurably
  // faster; `escape.test.ts` pins the copy in sync.
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
      const comp = vnode.tag;
      let result: unknown;
      try {
        result = comp(vnode.attrs);
      } catch (error) {
        return Promise.reject(annotate(error, comp));
      }
      // Reuses the `then` that was already there — no extra promise link.
      if (result instanceof Promise) {
        return result.then(
          (r) => renderNode(r),
          (error: unknown) => {
            throw annotate(error, comp);
          },
        );
      }
      if (isAsyncIterable(result)) {
        return collectAsyncIterable(result, renderNode).catch((error: unknown) => {
          throw annotate(error, comp);
        });
      }
      return renderNode(result);
    }

    // ── Regular element ──
    // The tag name was validated by the `VNode` constructor, which every string
    // tag reaching this walk went through; re-checking here charged every element
    // for the same answer twice.
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
        ),
      );
    }

    if (children !== undefined) {
      const content = renderChildrenAsync(children, childTag);
      if (content instanceof Promise) {
        return content.then((c) => serializeElement(tag, attrStr, c));
      }
      return serializeElement(tag, attrStr, content);
    }
    return serializeElement(tag, attrStr, "");
  }
  // Neither an array nor a VNode is ever an async iterable, and VNode is the
  // dominant case: only what is left pays for the protocol tests.
  if (isAsyncIterable(vnode)) return collectAsyncIterable(vnode, renderNode);
  if (isIterable(vnode)) return renderChildrenAsync(Array.from(vnode));
  return valueToText(vnode);
}

function renderChildrenAsync(children: unknown, rawtextTag?: string): string | Promise<string> {
  // A lone child is one child: it goes through `renderChild`, which is what
  // carries the rawtext rule. Inlining the string case here and falling through
  // to `renderNode` for everything else dropped the rule for the single-child
  // form — `<script>{promise}</script>` has exactly one child.
  if (!Array.isArray(children)) return renderChild(children, rawtextTag);
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
 * This is the engine's sequencing rule, not an implementation detail:
 * **components execute in document order.** Starting every remaining sibling
 * before awaiting any (`Promise.all`) would overlap their I/O and make the
 * document depend on which one finished first — a real race, since `context.ts`
 * is a mutable execution stack overlapping siblings would share. Deliberate
 * concurrency instead goes through `<Template>` / `<Slot>` in `@vincle/flow`,
 * visible in the markup.
 */
async function renderChildrenFrom(
  prefix: string,
  pending: Promise<string>,
  children: unknown[],
  from: number,
  rawtextTag: string | undefined,
): Promise<string> {
  return sequenceFrom(prefix + (await pending), children, from, (child) =>
    renderChild(child, rawtextTag),
  );
}

/**
 * The sequencing rule, as a primitive.
 *
 * One item at a time, in order, each started only once its left sibling is
 * done — never `Promise.all`. `jsx-runtime`'s precompile queues
 * (`escapeArrayFrom`, `renderTemplateAsync`) are the same loop; they call this
 * instead of re-implementing it, so a fix to the rule lands once.
 *
 * @internal
 */
export async function sequenceFrom<T>(
  prefix: string,
  items: readonly T[],
  from: number,
  render: (item: T, index: number) => string | Promise<string>,
): Promise<string> {
  let out = prefix;
  for (let i = from; i < items.length; i++) {
    // Bounded by the loop condition; `noUncheckedIndexedAccess` cannot see it.
    const part = render(items[i]!, i);
    out += typeof part === "string" ? part : await part;
  }
  return out;
}

/**
 * Render one child, carrying the rawtext rule of `<script>` / `<style>`.
 *
 * Must reach a wrapped string too (promise, iterable), not just a direct one —
 * `<script>{await getCode()}</script>` otherwise HTML-escaped the code instead
 * of leaving it as JS, since an HTML parser never decodes entities inside
 * rawtext. An element `VNode` child stays on `renderNode` (it produces markup,
 * which re-escaping would corrupt); a component child is invoked so its result
 * still carries the rule — `<script><Analytics/></script>` is ordinary.
 */
function renderChild(child: unknown, rawtextTag: string | undefined): string | Promise<string> {
  if (typeof child === "string") {
    return rawtextTag === undefined ? escapeContent(child) : escapeRawTagContent(child, rawtextTag);
  }
  if (rawtextTag !== undefined && !isElementNode(child)) {
    return renderRawtextChild(child, rawtextTag);
  }
  return renderNode(child);
}

const isElementNode = (v: unknown): boolean => v instanceof VNode && typeof v.tag === "string";

/**
 * The leaf taxonomy of `renderNode`, re-walked with the rawtext rule attached.
 *
 * It exists rather than a `rawtextTag` parameter on `renderNode` because that
 * parameter would be threaded through every node of every tree to serve two tag
 * names — the cost lands on the hot path, this does not: nothing reaches here
 * unless the element really is `<script>` or `<style>`.
 */
function renderRawtextChild(child: unknown, rawtextTag: string): string | Promise<string> {
  if (typeof child === "string") return escapeRawTagContent(child, rawtextTag);
  if (child === null || child === undefined || typeof child === "boolean") return "";
  if (typeof child === "number" || typeof child === "bigint") return String(child);
  if (child instanceof RawString) return child.value;
  if (child instanceof Promise) return child.then((r) => renderRawtextChild(r, rawtextTag));
  // A component: invoked here rather than in `renderNode`, so that whatever it
  // returns comes back through this function and keeps the rule. The promise and
  // async-iterable shapes it may return are already handled above and below —
  // only the call, its synchronous throw and its annotation are mirrored.
  if (child instanceof VNode) {
    // An element node reaching here is the shape `renderChild` sends straight to
    // `renderNode`; mirror that decision rather than assume a component. Without
    // this, a `<div/>` arriving indirectly — through a promise, an array, or a
    // component's return — hit `comp(child.attrs)` and threw
    // `comp is not a function`, naming an internal variable instead of the
    // problem. The entry guard only covers the *direct* child.
    if (typeof child.tag === "string") return renderNode(child);
    const comp = child.tag as (props: Record<string, unknown>) => unknown;
    let result: unknown;
    try {
      result = comp(child.attrs);
    } catch (error) {
      return Promise.reject(annotate(error, comp));
    }
    // `<script>` is cold; one `catch` for both async shapes is fine here,
    // where `renderNode` above splits them for the hot path's sake.
    const rendered = renderRawtextChild(result, rawtextTag);
    if (typeof rendered !== "string") {
      return rendered.catch((error: unknown) => {
        throw annotate(error, comp);
      });
    }
    return rendered;
  }
  if (Array.isArray(child)) return renderChildrenAsync(child, rawtextTag);
  if (isAsyncIterable(child)) {
    return collectAsyncIterable(child, (chunk) => renderRawtextChild(chunk, rawtextTag));
  }
  if (isIterable(child)) return renderChildrenAsync(Array.from(child), rawtextTag);
  // `String`, not `valueToText`: the latter HTML-escapes, which inside rawtext
  // is the one thing the whole design rejects — an entity is never decoded
  // there, so `<script>{obj}</script>` emitted `&lt;` into the JavaScript.
  // Every earlier branch has already taken null, boolean, RawString and VNode.
  return escapeRawTagContent(String(child), rawtextTag);
}

/**
 * Drain an async iterable in document order — the same sequencing rule as
 * `sequenceFrom`, over a pull-based source. `map` renders each chunk; the
 * precompile runtime passes its own (`jsxEscape` + hole render), the walk
 * passes `renderNode`.
 *
 * @internal
 */
export async function collectAsyncIterable(
  iterable: AsyncIterable<unknown>,
  map: (chunk: unknown) => string | Promise<string>,
): Promise<string> {
  let out = "";
  for await (const chunk of iterable) {
    const rendered = map(chunk);
    out += rendered instanceof Promise ? await rendered : rendered;
  }
  return out;
}

// ── Error annotation ──────────────────────────────────────────────────────
// `[Profile] not found` says where; `not found` alone doesn't. Innermost
// component only (no re-annotation up the chain), `Error` instances only
// (a thrown string keeps its identity), `message` only (`instanceof`/`cause`
// survive).

const ANNOTATED = new WeakSet<Error>();

type ComponentTag = (props: Record<string, unknown>) => unknown;

/**
 * `displayName` first: the function a HOC returns is named after the HOC, and
 * a minifier renames the rest. It is the one hook a component has to say what
 * it should be called.
 */
function componentName(comp: ComponentTag): string {
  const display = (comp as { displayName?: unknown }).displayName;
  if (typeof display === "string" && display !== "") return display;
  return comp.name || "<anonymous>";
}

/**
 * Prefix a thrown error's message with the name of the component that threw,
 * once. Returns the very same value it was given in every other case.
 */
function annotate(error: unknown, comp: ComponentTag): unknown {
  if (!(error instanceof Error) || ANNOTATED.has(error)) return error;
  ANNOTATED.add(error);
  try {
    error.message = `[${componentName(comp)}] ${error.message}`;
  } catch {
    // A frozen error, or a getter-only `message`. Nothing to write, and nothing
    // worth failing an otherwise-fine render for.
  }
  return error;
}
