import { buildAttrs } from "./attrs.js";
import { ERR_VOID_CHILDREN, vincleTypeError } from "./errors.js";
import {
  escapeContent,
  escapeRawTagContent,
  isAsyncIterable,
  isIterable,
  isRawtextTag,
  joinRawTagContent,
  renderLeaf,
  valueToText,
} from "./escape.js";
import {
  HTML_CONTEXT,
  childContext,
  mayTransition,
  scanTextContext,
  type ParseContext,
} from "./parse-context.js";
import {
  isVoidElement,
  serializeElement,
  serializeVoidElement,
  voidChildrenMessage,
} from "./serialize.js";
import { providerMarker, RawString, VNode, type ProvideFn } from "./types.js";
import { TemplateNode } from "./types.js";

/**
 * Render a JSX tree to an HTML string. Text is escaped; only `raw()` is not.
 *
 * Components may be async. Sibling subtrees start in document order and run
 * concurrently once one of them suspends; the output is joined in document
 * order whatever the completion order. A failure arrives as a rejection,
 * never as a synchronous throw, and rejects as soon as it happens, without
 * waiting for the siblings still in flight.
 *
 * Escaping follows the parser context the walk stands in: `<script>` and
 * `<style>` are raw text in the HTML namespace and ordinary markup in foreign
 * content, so their text under `<svg>` or `<math>` is escaped as text. The
 * context is structural (the element tree) and extends through markup text
 * from `raw()` and templates, which is scanned as it is emitted.
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
    return Promise.resolve(renderNode(node, HTML_CONTEXT));
  } catch (error) {
    // A synchronous throw would escape the caller's `.catch()`.
    return Promise.reject(error);
  }
}

/** An element with no children: the only shape a void tag can take at this point. */
function writeChildless(tag: string, attrStr: string): string {
  return isVoidElement(tag)
    ? serializeVoidElement(tag, attrStr)
    : serializeElement(tag, attrStr, "");
}

/**
 * Render one node to final text, in the parser context `ctx`.
 *
 * The context only moves for elements that transition namespaces, and for
 * markup text (see `parse-context.ts`); everything else hands `ctx` along.
 *
 * @internal
 */
export function renderNode(vnode: unknown, ctx: ParseContext): string | Promise<string> {
  // Fast path for leaves and `RawString`: saves 3.5 to 7.6% on `text`, `stack`, `realworld`.
  if (typeof vnode !== "object" || vnode === null) return renderLeaf(vnode, undefined);
  if (vnode instanceof RawString) return vnode.value;

  if (vnode instanceof Promise) {
    return vnode.then((v) => renderNode(v, ctx));
  }
  if (Array.isArray(vnode)) return renderChildrenAsync(vnode, ctx, undefined);
  if (vnode instanceof VNode) {
    if (typeof vnode.tag === "function") {
      const comp = vnode.tag;
      const provide = (comp as unknown as { [providerMarker]?: ProvideFn })[providerMarker];
      if (provide) {
        return provide(vnode.attrs["value"], () => renderNode(vnode.children, ctx));
      }
      let result: unknown;
      try {
        result = comp(vnode.attrs);
      } catch (error) {
        return Promise.reject(annotate(error, comp));
      }
      // By reference: a wrapper would allocate a closure per component.
      if (result instanceof Promise) {
        return result.then(
          (v) => renderNode(v, ctx),
          (error: unknown) => {
            throw annotate(error, comp);
          },
        );
      }
      if (isAsyncIterable(result)) {
        return collectAsyncIterable(result, (chunk) => renderNode(chunk, ctx)).catch(
          (error: unknown) => {
            throw annotate(error, comp);
          },
        );
      }
      return renderNode(result, ctx);
    }

    // The tag is validated in `jsx()`, the only way an element is built.
    const { tag, attrs, children } = vnode;

    // A void element takes no children. Checked at render, not construction:
    // the tree is format-neutral, and the void rule is HTML's.
    if (isVoidElement(tag) && children !== undefined) {
      throw vincleTypeError(voidChildrenMessage(tag), ERR_VOID_CHILDREN);
    }

    const attrStr = buildAttrs(attrs, tag);
    // The namespace the children stand in decides their escaping: rawtext
    // only in the HTML namespace, plain text escaping in foreign content.
    const childCtx = childContext(ctx, tag, attrs);
    const childTag = childCtx.ns === "html" && isRawtextTag(tag) ? tag : undefined;

    // Promised attribute value, e.g. `<a href={resolveUrl()}>`.
    if (typeof attrStr !== "string") {
      return attrStr.then(async (resolved) =>
        children === undefined
          ? writeChildless(tag, resolved)
          : serializeElement(
              tag,
              resolved,
              await renderChildrenAsync(children, childCtx, childTag),
            ),
      );
    }

    if (children !== undefined) {
      const content = renderChildrenAsync(children, childCtx, childTag);
      if (content instanceof Promise) {
        return content.then((c) => serializeElement(tag, attrStr, c));
      }
      return serializeElement(tag, attrStr, content);
    }
    return writeChildless(tag, attrStr);
  }
  if (vnode instanceof TemplateNode) {
    const result = vnode.render(ctx);
    return result instanceof Promise ? result.then((value) => value.value) : result.value;
  }
  // Arrays and VNodes are never async iterables: only the rest pays for the protocol tests.
  if (isAsyncIterable(vnode)) return collectAsyncIterable(vnode, (chunk) => renderNode(chunk, ctx));
  if (isIterable(vnode)) return renderChildrenAsync(Array.from(vnode), ctx, undefined);
  return valueToText(vnode);
}

/**
 * After a sibling whose bytes may open or close a namespace, the context the
 * next sibling stands in. Only `RawString` output can carry that markup:
 * escaped text contains no tag, and an element's output is balanced by
 * construction (a template's is the caller's; see `jsx-runtime.ts`).
 */
function contextAfter(ctx: ParseContext, child: unknown, part: string): ParseContext {
  return child instanceof RawString && mayTransition(part) ? scanTextContext(ctx, part) : ctx;
}

function renderChildrenAsync(
  children: unknown,
  ctx: ParseContext,
  rawtextTag?: string,
): string | Promise<string> {
  // A lone child needs the rawtext rule too (`<script>{promise}</script>`).
  if (!Array.isArray(children)) return renderChild(children, ctx, rawtextTag);
  if (children.length === 0) return "";

  // Concatenate directly: an intermediate array costs 35% on `realworld`.
  let out = "";
  if (rawtextTag === undefined) {
    let current = ctx;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const part = renderChild(child, current, undefined);
      if (typeof part !== "string") {
        // A suspended sibling's bytes are unknown when the rest start: they
        // run with the context known so far. A namespace opened and left open
        // by an async sibling's markup is a documented limit of `raw()`.
        return renderChildrenFrom(out, part, children, i + 1, current, undefined);
      }
      out += part;
      current = contextAfter(current, child, part);
    }
    return out;
  }

  for (let i = 0; i < children.length; i++) {
    const part = renderChild(children[i], ctx, rawtextTag);
    // First child that suspends: start the rest and join in document order.
    if (typeof part !== "string")
      return renderChildrenFrom(out, part, children, i + 1, ctx, rawtextTag);
    out = joinRawTagContent(out, part, rawtextTag);
  }
  return out;
}

/**
 * Finish a child list whose `from - 1`-th element suspended: start every
 * remaining sibling, then join in document order.
 *
 * **Siblings run concurrently, output stays in document order.** `Scope` is
 * shared per render and not arbitrated: a sibling that sets a value after
 * awaiting races with other siblings. Ordered coordination goes through
 * `<Defer>` / `<Slot>` in `@vincle/flow`. A rejection rejects the render
 * immediately; handlers stay attached, so late failures are swallowed.
 */
function renderChildrenFrom(
  prefix: string,
  pending: Promise<string>,
  children: unknown[],
  from: number,
  ctx: ParseContext,
  rawtextTag: string | undefined,
): Promise<string> {
  const parts: Array<string | Promise<string>> = [pending];
  for (let i = from; i < children.length; i++) {
    let part: string | Promise<string>;
    try {
      part = renderChild(children[i], ctx, rawtextTag);
    } catch (error) {
      // A synchronous throw becomes a rejection so the remaining siblings still start.
      part = Promise.reject(error);
    }
    parts.push(part);
  }
  return settleInDocumentOrder(prefix, parts, rawtextTag);
}

async function settleInDocumentOrder(
  prefix: string,
  parts: Array<string | Promise<string>>,
  rawtextTag: string | undefined,
): Promise<string> {
  const values = await settleConcurrent(parts);
  let out = prefix;
  for (const value of values) {
    out = rawtextTag === undefined ? out + value : joinRawTagContent(out, value, rawtextTag);
  }
  return out;
}

/**
 * Resolve every part to its value, in list order. The first rejection *in
 * time* rejects the whole. Siblings still in flight settle quietly (not
 * cancelled, only dropped). Shared by the tree walk, template holes and array holes.
 *
 * @internal
 */
export function settleConcurrent(parts: Array<string | Promise<string>>): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const values = Array.from<string>({ length: parts.length });
    let remaining = parts.length;
    if (remaining === 0) {
      resolve(values);
      return;
    }
    parts.forEach((part, i) => {
      Promise.resolve(part).then(
        (value) => {
          values[i] = value;
          if (--remaining === 0) resolve(values);
        },
        (reason: unknown) => reject(reason),
      );
    });
  });
}

/**
 * Run steps in document order: each starts after the previous one completes,
 * and a rejection stops the rest. The callback receives the accumulated text
 * and returns its replacement. The engine's own sibling lists use
 * `settleConcurrent` instead.
 *
 * @internal
 */
export async function sequenceFrom<T>(
  prefix: string,
  items: readonly T[],
  from: number,
  step: (out: string, item: T, index: number) => string | Promise<string>,
): Promise<string> {
  let out = prefix;
  for (let i = from; i < items.length; i++) {
    const next = step(out, items[i]!, i);
    out = typeof next === "string" ? next : await next;
  }
  return out;
}

/**
 * Render one child, carrying the rawtext rule of `<script>` / `<style>`.
 *
 * Wrapped strings (promise, iterable) follow the rule: rawtext never decodes
 * entities, so `<script>{await getCode()}</script>` must not be HTML-escaped.
 * Element `VNode`s stay on `renderNode`; a component's result carries the rule.
 */
function renderChild(
  child: unknown,
  ctx: ParseContext,
  rawtextTag: string | undefined,
): string | Promise<string> {
  if (typeof child === "string") {
    return rawtextTag === undefined ? escapeContent(child) : escapeRawTagContent(child, rawtextTag);
  }
  if (rawtextTag !== undefined && !isElementNode(child)) {
    return renderRawtextChild(child, ctx, rawtextTag);
  }
  return renderNode(child, ctx);
}

const isElementNode = (v: unknown): boolean => v instanceof VNode && typeof v.tag === "string";

/** `renderNode` with the rawtext rule attached, kept apart so the hot path has no `rawtextTag` parameter. */
function renderRawtextChild(
  child: unknown,
  ctx: ParseContext,
  rawtextTag: string,
): string | Promise<string> {
  if (child instanceof Promise) return child.then((r) => renderRawtextChild(r, ctx, rawtextTag));
  if (child instanceof TemplateNode) return renderNode(child, ctx);
  // Components are invoked here so their result keeps the rule.
  if (child instanceof VNode) {
    // `renderChild` only guards the direct child: an element arriving through a
    // promise, array or component return must not be called as a component.
    if (typeof child.tag === "string") return renderNode(child, ctx);
    const comp = child.tag as (props: Record<string, unknown>) => unknown;
    const provide = (comp as unknown as { [providerMarker]?: ProvideFn })[providerMarker];
    if (provide) {
      return provide(child.attrs["value"], () =>
        renderRawtextChild(child.children, ctx, rawtextTag),
      );
    }
    let result: unknown;
    try {
      result = comp(child.attrs);
    } catch (error) {
      return Promise.reject(annotate(error, comp));
    }
    // Cold path: one `catch` covers both async shapes.
    const rendered = renderRawtextChild(result, ctx, rawtextTag);
    if (typeof rendered !== "string") {
      return rendered.catch((error: unknown) => {
        throw annotate(error, comp);
      });
    }
    return rendered;
  }
  if (Array.isArray(child)) return renderChildrenAsync(child, ctx, rawtextTag);
  if (isAsyncIterable(child)) {
    return collectAsyncIterable(
      child,
      (chunk) => renderRawtextChild(chunk, ctx, rawtextTag),
      rawtextTag,
    );
  }
  if (isIterable(child)) return renderChildrenAsync(Array.from(child), ctx, rawtextTag);
  return renderLeaf(child, rawtextTag);
}

/**
 * Drain an async iterable in document order; `map` renders each chunk.
 *
 * @internal
 */
export async function collectAsyncIterable(
  iterable: AsyncIterable<unknown>,
  map: (chunk: unknown) => string | Promise<string>,
  rawtextTag?: string,
): Promise<string> {
  let out = "";
  if (rawtextTag === undefined) {
    for await (const chunk of iterable) {
      const rendered = map(chunk);
      out += rendered instanceof Promise ? await rendered : rendered;
    }
    return out;
  }

  for await (const chunk of iterable) {
    const rendered = map(chunk);
    const part = rendered instanceof Promise ? await rendered : rendered;
    out = joinRawTagContent(out, part, rawtextTag);
  }
  return out;
}

// ── Error annotation ──────────────────────────────────────────────────────
// `[Profile] not found` says where. Innermost component only, `Error`
// instances only, `message` only (`instanceof` and `cause` survive).

const ANNOTATED = new WeakSet<Error>();

type ComponentTag = (props: Record<string, unknown>) => unknown;

/** `displayName` first: a HOC's result is named after the HOC, and minifiers rename the rest. */
function componentName(comp: ComponentTag): string {
  const display = (comp as { displayName?: unknown }).displayName;
  if (typeof display === "string" && display !== "") return display;
  return comp.name || "<anonymous>";
}

/** Prefix an error's message with the name of the component that threw, once. */
function annotate(error: unknown, comp: ComponentTag): unknown {
  if (!(error instanceof Error) || ANNOTATED.has(error)) return error;
  ANNOTATED.add(error);
  try {
    error.message = `[${componentName(comp)}] ${error.message}`;
  } catch {
    // Frozen error or getter-only `message`: not worth failing the render.
  }
  return error;
}
