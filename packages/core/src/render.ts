import { buildAttrs } from "./attrs.js";
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
import { isVoidElement, serializeElement, serializeVoidElement } from "./serialize.js";
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

export function renderNode(vnode: unknown): string | Promise<string> {
  // Fast path for leaves and `RawString`: saves 3.5 to 7.6% on `text`, `stack`, `realworld`.
  if (typeof vnode !== "object" || vnode === null) return renderLeaf(vnode, undefined);
  if (vnode instanceof RawString) return vnode.value;

  if (vnode instanceof Promise) {
    return vnode.then(renderNode);
  }
  if (Array.isArray(vnode)) return renderChildrenAsync(vnode);
  if (vnode instanceof VNode) {
    if (typeof vnode.tag === "function") {
      const comp = vnode.tag;
      const provide = (comp as unknown as { [providerMarker]?: ProvideFn })[providerMarker];
      if (provide) {
        return provide(vnode.attrs["value"], () => renderNode(vnode.children));
      }
      let result: unknown;
      try {
        result = comp(vnode.attrs);
      } catch (error) {
        return Promise.reject(annotate(error, comp));
      }
      // By reference: a wrapper would allocate a closure per component.
      if (result instanceof Promise) {
        return result.then(renderNode, (error: unknown) => {
          throw annotate(error, comp);
        });
      }
      if (isAsyncIterable(result)) {
        return collectAsyncIterable(result, renderNode).catch((error: unknown) => {
          throw annotate(error, comp);
        });
      }
      return renderNode(result);
    }

    // The tag is validated in `jsx()`, the only way an element is built.
    const { tag, attrs, children } = vnode;

    const attrStr = buildAttrs(attrs, tag);
    const childTag = isRawtextTag(tag) ? tag : undefined;

    // Promised attribute value, e.g. `<a href={resolveUrl()}>`.
    if (typeof attrStr !== "string") {
      return attrStr.then(async (resolved) =>
        children === undefined
          ? writeChildless(tag, resolved)
          : serializeElement(tag, resolved, await renderChildrenAsync(children, childTag)),
      );
    }

    if (children !== undefined) {
      const content = renderChildrenAsync(children, childTag);
      if (content instanceof Promise) {
        return content.then((c) => serializeElement(tag, attrStr, c));
      }
      return serializeElement(tag, attrStr, content);
    }
    return writeChildless(tag, attrStr);
  }
  if (vnode instanceof TemplateNode) {
    const result = vnode.render();
    return result instanceof Promise ? result.then((value) => value.value) : result.value;
  }
  // Arrays and VNodes are never async iterables: only the rest pays for the protocol tests.
  if (isAsyncIterable(vnode)) return collectAsyncIterable(vnode, renderNode);
  if (isIterable(vnode)) return renderChildrenAsync(Array.from(vnode));
  return valueToText(vnode);
}

function renderChildrenAsync(children: unknown, rawtextTag?: string): string | Promise<string> {
  // A lone child needs the rawtext rule too (`<script>{promise}</script>`).
  if (!Array.isArray(children)) return renderChild(children, rawtextTag);
  if (children.length === 0) return "";

  // Concatenate directly: an intermediate array costs 35% on `realworld`.
  let out = "";
  if (rawtextTag === undefined) {
    for (let i = 0; i < children.length; i++) {
      const part = renderChild(children[i], undefined);
      if (typeof part !== "string")
        return renderChildrenFrom(out, part, children, i + 1, undefined);
      out += part;
    }
    return out;
  }

  for (let i = 0; i < children.length; i++) {
    const part = renderChild(children[i], rawtextTag);
    // First child that suspends: start the rest and join in document order.
    if (typeof part !== "string") return renderChildrenFrom(out, part, children, i + 1, rawtextTag);
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
  rawtextTag: string | undefined,
): Promise<string> {
  const parts: Array<string | Promise<string>> = [pending];
  for (let i = from; i < children.length; i++) {
    let part: string | Promise<string>;
    try {
      part = renderChild(children[i], rawtextTag);
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

/** `renderNode` with the rawtext rule attached, kept apart so the hot path has no `rawtextTag` parameter. */
function renderRawtextChild(child: unknown, rawtextTag: string): string | Promise<string> {
  if (child instanceof Promise) return child.then((r) => renderRawtextChild(r, rawtextTag));
  if (child instanceof TemplateNode) return renderNode(child);
  // Components are invoked here so their result keeps the rule.
  if (child instanceof VNode) {
    // `renderChild` only guards the direct child: an element arriving through a
    // promise, array or component return must not be called as a component.
    if (typeof child.tag === "string") return renderNode(child);
    const comp = child.tag as (props: Record<string, unknown>) => unknown;
    const provide = (comp as unknown as { [providerMarker]?: ProvideFn })[providerMarker];
    if (provide) {
      return provide(child.attrs["value"], () => renderRawtextChild(child.children, rawtextTag));
    }
    let result: unknown;
    try {
      result = comp(child.attrs);
    } catch (error) {
      return Promise.reject(annotate(error, comp));
    }
    // Cold path: one `catch` covers both async shapes.
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
    return collectAsyncIterable(
      child,
      (chunk) => renderRawtextChild(chunk, rawtextTag),
      rawtextTag,
    );
  }
  if (isIterable(child)) return renderChildrenAsync(Array.from(child), rawtextTag);
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
